import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SessionLogReader, homeJoin } from "../sessionLogReader.js";
import type { RawRateLimitBucket, RawRateLimitsResponse } from "../types.js";
import type { TokenRecord } from "./types.js";

const RATE_LIMIT_TAIL_BYTES = 2 * 1024 * 1024;
const MAX_RATE_LIMIT_FILES = 32;

export interface CodexRateLimitSnapshot {
  response: RawRateLimitsResponse;
  observedAt: string;
}

/**
 * Codex logs live under ~/.codex/sessions (recursively, .jsonl files). Each
 * event_msg with payload.type === "token_count" carries info.total_token_usage
 * whose total_tokens is a per-session MONOTONIC counter. We turn each counter
 * value into a record carrying the delta since the previous counter for that
 * file.
 *
 * The cursor persisted per file is the last-seen total_tokens, resumed via
 * beginFile, so deltas stay correct across incremental reads. A monotonic
 * dedupeKey collapses repeats of the same counter value.
 */
export class CodexSessionLogReader extends SessionLogReader {
  protected readonly logRoot: string;
  protected readonly cachePath: string;

  constructor(options: { logRoot?: string; cachePath?: string; now?: () => Date; retentionDays?: number; timeZone?: string } = {}) {
    super({
      ...(options.now ? { now: options.now } : {}),
      ...(options.retentionDays ? { retentionDays: options.retentionDays } : {}),
      ...(options.timeZone !== undefined ? { timeZone: options.timeZone } : {}),
    });
    this.logRoot = options.logRoot ?? homeJoin(".codex", "sessions");
    this.cachePath = options.cachePath ?? join(homedir(), ".codex-usage-monitor", "usage-cache.json");
  }

  private lastTotal = 0;
  private latestRateLimits: CodexRateLimitSnapshot | null = null;

  protected beginFile(previousCursor?: number): void {
    this.lastTotal = previousCursor ?? 0;
  }

  protected endFile(): number | undefined {
    return this.lastTotal || undefined;
  }

  protected parseRecord(line: string): TokenRecord | null {
    const event = JSON.parse(line) as { timestamp?: unknown; type?: unknown; payload?: unknown };
    if (event.type !== "event_msg" || !event.payload || typeof event.payload !== "object") return null;
    const payload = event.payload as { type?: unknown; info?: unknown; rate_limits?: unknown };
    if (payload.type !== "token_count") return null;
    this.captureRateLimits(event.timestamp, payload.rate_limits);
    const info = payload.info;
    if (!info || typeof info !== "object") return null;
    const total = (info as { total_token_usage?: Record<string, unknown> }).total_token_usage;
    if (!total || typeof total !== "object") return null;
    const value = total as Record<string, unknown>;
    const numeric = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
    const totalTokens = numeric(value.total_tokens);
    if (!totalTokens) return null;
    const delta = totalTokens >= this.lastTotal ? totalTokens - this.lastTotal : totalTokens;
    this.lastTotal = totalTokens;
    const input = numeric(value.input_tokens);
    const output = numeric(value.output_tokens);
    const cachedInput = numeric(value.cached_input_tokens);
    // Split the delta across buckets proportional to the counter's composition.
    const ratio = totalTokens > 0 ? delta / totalTokens : 0;
    const timestamp = typeof event.timestamp === "string" ? event.timestamp : "";
    return {
      dedupeKey: `codex:${totalTokens}`,
      input: Math.round(input * ratio),
      output: Math.round(output * ratio),
      cachedInput: Math.round(cachedInput * ratio),
      // The authoritative total is the true counter delta, not the rounded sum
      // of the split components (which can drift by a token due to rounding).
      total: delta,
      timestamp,
      model: null,
    };
  }

  /**
   * Read the newest official rate-limit event already persisted by Codex.
   * This is the Windows Store fallback when a separate process cannot execute
   * Codex's packaged app-server. Only token_count/rate_limits fields are read.
   */
  async readLatestRateLimits(): Promise<CodexRateLimitSnapshot | null> {
    if (this.latestRateLimits) return this.latestRateLimits;
    if (!existsSync(this.logRoot)) return null;

    const candidates = (
      await Promise.all(
        (await this.listJsonl(this.logRoot)).map(async (file) => {
          try {
            const stat = await fs.stat(file);
            return { file, mtimeMs: stat.mtimeMs, size: stat.size };
          } catch {
            return null;
          }
        }),
      )
    )
      .filter((item): item is { file: string; mtimeMs: number; size: number } => item !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, MAX_RATE_LIMIT_FILES);

    for (const candidate of candidates) {
      const latest = this.latestRateLimits as CodexRateLimitSnapshot | null;
      if (
        latest &&
        candidate.mtimeMs <= Date.parse(latest.observedAt)
      ) {
        break;
      }
      try {
        const start = Math.max(0, candidate.size - RATE_LIMIT_TAIL_BYTES);
        const handle = await fs.open(candidate.file, "r");
        try {
          const buffer = Buffer.alloc(candidate.size - start);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
          const lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/);
          for (let index = lines.length - 1; index >= 0; index -= 1) {
            const line = lines[index];
            if (!line?.includes('"token_count"') || !line.includes('"rate_limits"')) continue;
            try {
              const event = JSON.parse(line) as { timestamp?: unknown; type?: unknown; payload?: unknown };
              if (event.type !== "event_msg" || !event.payload || typeof event.payload !== "object") continue;
              const payload = event.payload as { type?: unknown; rate_limits?: unknown };
              if (payload.type !== "token_count") continue;
              this.captureRateLimits(event.timestamp, payload.rate_limits);
              if ((this.latestRateLimits as CodexRateLimitSnapshot | null) !== null) break;
            } catch {
              // The first tail line may be partial; malformed/non-usage lines are ignored.
            }
          }
        } finally {
          await handle.close();
        }
      } catch {
        // Active session files may briefly be unavailable; continue to older files.
      }
    }
    return this.latestRateLimits;
  }

  private captureRateLimits(timestamp: unknown, raw: unknown): void {
    if (typeof timestamp !== "string" || !raw || typeof raw !== "object") return;
    const observedMs = Date.parse(timestamp);
    if (!Number.isFinite(observedMs)) return;
    const currentMs = this.latestRateLimits ? Date.parse(this.latestRateLimits.observedAt) : -Infinity;
    if (observedMs <= currentMs) return;
    this.latestRateLimits = {
      response: { rateLimits: raw as RawRateLimitBucket },
      observedAt: timestamp,
    };
  }
}
