import { homedir } from "node:os";
import { join } from "node:path";
import { SessionLogReader, homeJoin } from "../sessionLogReader.js";
import type { TokenRecord } from "./types.js";

/**
 * ZCode logs live under ~/.zcode/v2/agent-config (recursively, .jsonl files,
 * one per session under a projects subtree). Each assistant turn carries
 * message.usage with per-API-call token counts (NOT a monotonic counter). A
 * single message.id may repeat across adjacent content blocks (thinking +
 * tool_use), so we dedupe by message.id within a pass and sum the unique calls.
 * model is carried so the card can break usage down per model.
 *
 * Only numeric usage fields are read. The ZCode config and credentials files
 * are never opened; this reader stays within the lint rule that forbids
 * credential references in server sources.
 */
export class ZcodeSessionLogReader extends SessionLogReader {
  protected readonly logRoot: string;
  protected readonly cachePath: string;

  static defaultRoot(): string {
    return process.env.ZCODE_LOG_ROOT ?? homeJoin(".zcode", "v2", "agent-config");
  }

  constructor(options: { logRoot?: string; cachePath?: string; now?: () => Date; retentionDays?: number; timeZone?: string } = {}) {
    super({
      ...(options.now ? { now: options.now } : {}),
      ...(options.retentionDays ? { retentionDays: options.retentionDays } : {}),
      ...(options.timeZone !== undefined ? { timeZone: options.timeZone } : {}),
    });
    this.logRoot = options.logRoot ?? ZcodeSessionLogReader.defaultRoot();
    this.cachePath = options.cachePath ?? join(homedir(), ".codex-usage-monitor", "zcode-usage-cache.json");
  }

  protected parseRecord(line: string): TokenRecord | null {
    const event = JSON.parse(line) as { type?: unknown; timestamp?: unknown; message?: unknown };
    if (event.type !== "assistant" || !event.message || typeof event.message !== "object") return null;
    const message = event.message as { id?: unknown; model?: unknown; usage?: unknown };
    if (!message.usage || typeof message.usage !== "object") return null;
    const usage = message.usage as Record<string, unknown>;
    const numeric = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
    const input = numeric(usage.input_tokens);
    const output = numeric(usage.output_tokens);
    const cachedInput = numeric(usage.cache_read_input_tokens) + numeric(usage.cache_creation_input_tokens);
    if (!input && !output && !cachedInput) return null;
    const id = typeof message.id === "string" ? message.id : "";
    const model = typeof message.model === "string" ? message.model : null;
    const timestamp = typeof event.timestamp === "string" ? event.timestamp : "";
    return { dedupeKey: id ? `zcode:${id}` : "", input, output, cachedInput, total: input + cachedInput + output, timestamp, model };
  }
}
