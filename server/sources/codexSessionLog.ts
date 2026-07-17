import { homedir } from "node:os";
import { join } from "node:path";
import { SessionLogReader, homeJoin } from "../sessionLogReader.js";
import type { TokenRecord } from "./types.js";

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

  constructor(options: { logRoot?: string; cachePath?: string; now?: () => Date; retentionDays?: number } = {}) {
    super({
      ...(options.now ? { now: options.now } : {}),
      ...(options.retentionDays ? { retentionDays: options.retentionDays } : {}),
    });
    this.logRoot = options.logRoot ?? homeJoin(".codex", "sessions");
    this.cachePath = options.cachePath ?? join(homedir(), ".codex-usage-monitor", "usage-cache.json");
  }

  private lastTotal = 0;

  protected beginFile(previousCursor?: number): void {
    this.lastTotal = previousCursor ?? 0;
  }

  protected endFile(): number | undefined {
    return this.lastTotal || undefined;
  }

  protected parseRecord(line: string): TokenRecord | null {
    const event = JSON.parse(line) as { timestamp?: unknown; type?: unknown; payload?: unknown };
    if (event.type !== "event_msg" || !event.payload || typeof event.payload !== "object") return null;
    const payload = event.payload as { type?: unknown; info?: unknown };
    if (payload.type !== "token_count") return null;
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
}
