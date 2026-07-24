import { createReadStream, existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { dateKeyDaysAgo, toLocalDateKey, type LocalDateKeyOptions } from "./time.js";
import type { LocalUsageResult, ModelUsage, TokenUsage, UsageWarning } from "./types.js";
import { emptyLogCache, type LogCacheState, type TokenRecord } from "./sources/types.js";

interface FileState {
  offset: number;
  /** Optional subclass resume cursor persisted across reads (e.g. Codex lastTotal). */
  cursor?: number;
}

/** Build a FileState without tripping exactOptionalPropertyTypes on undefined. */
function fileState(offset: number, cursor: number | undefined): FileState {
  return cursor === undefined ? { offset } : { offset, cursor };
}

/**
 * Incremental, cached reader for `.jsonl` session logs. Subclasses implement
 * `parseRecord()` to turn a raw line into a {@link TokenRecord} (or null).
 *
 * Two accumulation models are supported via the record's `dedupeKey`:
 *  - Monotonic counter (Codex `total_tokens`): subclass should produce records
 *    whose `dedupeKey` carries a per-file monotonic value; the base class still
 *    de-dupes identical consecutive keys, and callers that need delta math
 *    embed it in the record values directly (see CodexSessionLogReader).
 *  - Per-call usage (ZCode `response.usage`): subclass sets `dedupeKey` to a
 *    stable per-API-call id (e.g. `requestId`); the base class accumulates the
 *    record's input/output verbatim, skipping ids already seen in this pass.
 *
 * Only numeric token fields are read. Conversation content, tool inputs and any
 * credential-like fields are never inspected or persisted, satisfying the lint
 * rule that forbids credential references in server sources.
 */
export abstract class SessionLogReader {
  /** Absolute root to scan recursively for `*.jsonl`. */
  protected abstract readonly logRoot: string;
  /** Distinct cache file so two clients never share aggregation state. */
  protected abstract readonly cachePath: string;

  protected readonly now: () => Date;
  protected readonly retentionDays: number;
  /**
   * IANA 时区；undefined = 系统本地时区（生产跟随用户机器）。
   * 测试通过显式注入（如 "Asia/Hong_Kong"）保证 bucket key 的确定性。
   * 与 renderer 的 todayKey 共用同一契约（见 server/time.ts）。
   */
  protected readonly timeZone: string | undefined;
  private cache: LogCacheState | null = null;

  constructor(options: { now?: () => Date; retentionDays?: number; timeZone?: string } = {}) {
    this.now = options.now ?? (() => new Date());
    this.retentionDays = options.retentionDays ?? 30;
    this.timeZone = options.timeZone;
  }

  /** dateKey 选项，传给 shared time 工具。子类无需关心，仅供内部方法复用。 */
  protected get dateKeyOptions(): LocalDateKeyOptions {
    return { now: this.now, timeZone: this.timeZone };
  }

  /**
   * Parse one raw JSON line into a record, or return null if the line has no
   * usable token data. Malformed JSON may throw; the base class counts and
   * skips it without treating valid non-usage records as corrupt.
   */
  protected abstract parseRecord(line: string): TokenRecord | null;

  async read(days = 30): Promise<LocalUsageResult> {
    const warnings: UsageWarning[] = [];
    const cache = await this.loadCache(warnings);
    if (!existsSync(this.logRoot)) {
      return {
        tokenUsage: this.toUsage(cache, days),
        models: this.toModels(cache),
        warnings: [{ code: "SESSIONS_NOT_FOUND", message: "本机会话日志目录不存在。" }, ...warnings],
      };
    }
    for (const file of await this.listJsonl(this.logRoot)) {
      try {
        await this.readFileIncrement(file, cache, warnings);
      } catch (error) {
        warnings.push({
          code: "SESSION_FILE_UNREADABLE",
          message: `一个会话日志文件无法读取：${error instanceof Error ? (error as NodeJS.ErrnoException).code ?? error.name : "unknown"}。`,
        });
      }
    }
    this.prune(cache);
    cache.updatedAt = this.now().toISOString();
    await this.saveCache(cache, warnings);
    return { tokenUsage: this.toUsage(cache, days), models: this.toModels(cache), warnings };
  }

  private async loadCache(warnings: UsageWarning[]): Promise<LogCacheState> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await fs.readFile(this.cachePath, "utf8")) as Partial<LogCacheState>;
      // Defensive normalization: older caches (or caches from a different schema)
      // may lack newer fields like `models` or use different daily shapes. Fill
      // any missing piece rather than trusting the on-disk shape blindly.
      this.cache = parsed && parsed.schemaVersion === 2 ? this.normalizeCache(parsed) : emptyLogCache();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      this.cache = emptyLogCache();
      if (code && code !== "ENOENT") warnings.push({ code: "CACHE_UNREADABLE", message: "聚合缓存无法读取，已从会话日志增量重建。" });
    }
    return this.cache;
  }

  /** Ensure every field exists, defaulting missing ones. Tolerates legacy caches. */
  private normalizeCache(parsed: Partial<LogCacheState>): LogCacheState {
    const base = emptyLogCache();
    // Daily values must be bucket objects {input,output,cachedInput,total}; a
    // legacy cache stores bare numbers, so validate and reset if mismatched.
    let daily = base.daily;
    if (parsed.daily && typeof parsed.daily === "object") {
      const sample = Object.values(parsed.daily)[0];
      if (sample && typeof sample === "object" && "input" in sample) {
        daily = parsed.daily as LogCacheState["daily"];
      }
    }
    let models = base.models;
    if (parsed.models && typeof parsed.models === "object") {
      const sample = Object.values(parsed.models)[0];
      if (sample && typeof sample === "object" && "input" in sample) {
        models = parsed.models as LogCacheState["models"];
      }
    }
    return {
      schemaVersion: 2,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : base.updatedAt,
      lifetimeInput: typeof parsed.lifetimeInput === "number" ? parsed.lifetimeInput : base.lifetimeInput,
      lifetimeOutput: typeof parsed.lifetimeOutput === "number" ? parsed.lifetimeOutput : base.lifetimeOutput,
      lifetimeCachedInput: typeof parsed.lifetimeCachedInput === "number" ? parsed.lifetimeCachedInput : base.lifetimeCachedInput,
      lifetimeTotal: typeof parsed.lifetimeTotal === "number" ? parsed.lifetimeTotal : base.lifetimeTotal,
      daily,
      models,
      files: parsed.files && typeof parsed.files === "object" ? (parsed.files as LogCacheState["files"]) : base.files,
    };
  }

  private async saveCache(cache: LogCacheState, warnings: UsageWarning[]): Promise<void> {
    try {
      await fs.mkdir(dirname(this.cachePath), { recursive: true });
      await fs.writeFile(this.cachePath, `${JSON.stringify(cache, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch {
      warnings.push({ code: "CACHE_WRITE_FAILED", message: "聚合缓存无法保存；本次结果仍可使用。" });
    }
  }

  protected async listJsonl(root: string): Promise<string[]> {
    const result: string[] = [];
    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && entry.name.endsWith(".jsonl")) result.push(path);
      }
    }
    await walk(root);
    return result;
  }

  private async readFileIncrement(file: string, cache: LogCacheState, warnings: UsageWarning[]): Promise<void> {
    const stat = await fs.stat(file);
    const previous = cache.files[file];
    const offset = previous && previous.offset <= stat.size ? previous.offset : 0;
    if (offset >= stat.size) {
      cache.files[file] = fileState(stat.size, previous?.cursor);
      return;
    }
    // Allow subclasses using a monotonic counter (Codex) to resume from the last
    // counter value persisted for this file, so deltas stay correct across reads.
    this.beginFile(previous?.cursor);
    // De-dupe keys seen only within this incremental pass; the jsonl append-only
    // model guarantees repeats of the same id are contiguous, so a Set scoped to
    // one file-read is sufficient and avoids persisting ids in the cache.
    const seenKeys = new Set<string>();
    let badLines = 0;
    const stream = createReadStream(file, { encoding: "utf8", start: offset });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) {
      // Codex uses snake_case `*_tokens`; current ZCode logs use camelCase
      // `*Tokens`. Keep the cheap pre-filter without making it case-sensitive.
      if (!/token/i.test(line)) continue;
      let record: TokenRecord | null;
      try {
        record = this.parseRecord(line);
      } catch {
        badLines += 1;
        continue;
      }
      if (!record) continue;
      if (record.dedupeKey && seenKeys.has(record.dedupeKey)) continue;
      if (record.dedupeKey) seenKeys.add(record.dedupeKey);
      cache.lifetimeInput += record.input;
      cache.lifetimeOutput += record.output;
      cache.lifetimeCachedInput += record.cachedInput;
      cache.lifetimeTotal += record.total;
      // Bucket key 是该 record 时间戳在本地时区下的自然日。如果 record 没有
      // 时间戳或时间戳非法，用"现在"的本地自然日兜底。与 renderer todayKey 用同一
      // 实现（server/time.ts toLocalDateKey），保证两端"今日"语义一致。
      const recordDate =
        toLocalDateKey(new Date(record.timestamp), this.timeZone) ||
        toLocalDateKey(this.now(), this.timeZone);
      const day = (cache.daily[recordDate] ??= { input: 0, output: 0, cachedInput: 0, total: 0 });
      day.input += record.input;
      day.output += record.output;
      day.cachedInput += record.cachedInput;
      day.total += record.total;
      if (record.model) {
        const model = (cache.models[record.model] ??= { input: 0, output: 0 });
        model.input += record.input;
        model.output += record.output;
      }
    }
    cache.files[file] = fileState(stat.size, this.endFile());
    if (badLines > 0) warnings.push({ code: "BAD_SESSION_JSON", message: `已跳过 ${badLines} 行无法解析的会话日志。` });
  }

  /** Called before reading each file; default no-op. `previousCursor` resumes a counter. */
  protected beginFile(previousCursor?: number): void {
    void previousCursor;
  }

  /** Called after reading each file; returns the cursor to persist for next time. */
  protected endFile(): number | undefined {
    return undefined;
  }

  private prune(cache: LogCacheState): void {
    // 用本地自然日计算 cutoff（retentionDays 天前的日历日），与 bucket key 同契约。
    const cutoff = dateKeyDaysAgo(this.retentionDays, this.dateKeyOptions);
    for (const date of Object.keys(cache.daily)) if (date < cutoff) delete cache.daily[date];
  }

  private toUsage(cache: LogCacheState, days: number): TokenUsage {
    // 用本地自然日计算 cutoff（days 天前的日历日，含今天共 days 天）。
    const cutoff = dateKeyDaysAgo(days, this.dateKeyOptions);
    const daily = Object.entries(cache.daily)
      .filter(([date]) => date >= cutoff)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({ date, tokens: bucket.total }));
    const lifetimeTotal = cache.lifetimeTotal;
    return {
      input: cache.lifetimeInput || null,
      cachedInput: cache.lifetimeCachedInput || null,
      output: cache.lifetimeOutput || null,
      reasoningOutput: null,
      total: lifetimeTotal || null,
      lifetimeTotal: lifetimeTotal || null,
      daily,
      source: lifetimeTotal || daily.length ? "local_session" : "none",
      quality: lifetimeTotal || daily.length ? "local_estimate" : "unavailable",
    };
  }

  private toModels(cache: LogCacheState): ModelUsage[] | null {
    const entries = Object.entries(cache.models);
    if (!entries.length) return null;
    return entries.sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => ({ name, ...value }));
  }
}

/** Convenience helper for subclasses that resolve `~`-style home roots. */
export function homeJoin(...segments: string[]): string {
  return join(homedir(), ...segments);
}
