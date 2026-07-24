import { homedir } from "node:os";
import { join } from "node:path";
import { SessionLogReader, homeJoin } from "../sessionLogReader.js";
import type { TokenRecord } from "./types.js";

/**
 * The GLM app-server embedded in the ZCode desktop client writes one
 * `model-io-<session>.jsonl` file per session under ~/.zcode/cli/rollout.
 * Each `model_io` record carries per-request numeric usage in response.usage.
 * requestId is stable, so duplicate records in one incremental pass are counted
 * once. model.modelId is retained for the per-model breakdown.
 *
 * inputTokens already includes cache hits; totalTokens is authoritative and
 * normally equals inputTokens + outputTokens. cacheReadTokens/cacheWriteTokens
 * are tracked separately but must not be added to the total a second time.
 *
 * Only the identifiers, timestamps, model id and numeric usage fields are
 * inspected. Request/response content and tool inputs are never accessed.
 */
export class ZcodeSessionLogReader extends SessionLogReader {
  protected readonly logRoot: string;
  protected readonly cachePath: string;

  static defaultRoot(): string {
    return process.env.ZCODE_LOG_ROOT ?? homeJoin(".zcode", "cli", "rollout");
  }

  constructor(
    options: {
      logRoot?: string;
      cachePath?: string;
      now?: () => Date;
      retentionDays?: number;
      timeZone?: string;
    } = {},
  ) {
    super({
      ...(options.now ? { now: options.now } : {}),
      ...(options.retentionDays ? { retentionDays: options.retentionDays } : {}),
      ...(options.timeZone !== undefined ? { timeZone: options.timeZone } : {}),
    });
    this.logRoot = options.logRoot ?? ZcodeSessionLogReader.defaultRoot();
    // Use a new cache namespace: the former cache contains legacy
    // ~/.zcode/v2/agent-config totals with incompatible counting semantics.
    this.cachePath =
      options.cachePath ?? join(homedir(), ".codex-usage-monitor", "zcode-model-io-cache.json");
  }

  protected parseRecord(line: string): TokenRecord | null {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type !== "model_io") return null;

    const response =
      event.response && typeof event.response === "object"
        ? (event.response as Record<string, unknown>)
        : null;
    const usage =
      response?.usage && typeof response.usage === "object"
        ? (response.usage as Record<string, unknown>)
        : null;
    if (!usage) return null;

    const numeric = (value: unknown): number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
    const optionalNumeric = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const input = numeric(usage.inputTokens);
    const output = numeric(usage.outputTokens);
    const cachedInput = numeric(usage.cacheReadTokens) + numeric(usage.cacheWriteTokens);
    const reportedTotal = optionalNumeric(usage.totalTokens);
    const total = reportedTotal ?? input + output;
    if (!input && !output && !cachedInput && !total) return null;

    const id = typeof event.requestId === "string" ? event.requestId : "";
    const modelRecord =
      event.model && typeof event.model === "object"
        ? (event.model as Record<string, unknown>)
        : null;
    const model =
      typeof modelRecord?.modelId === "string"
        ? modelRecord.modelId
        : typeof event.model === "string"
          ? event.model
          : null;
    const timestamp =
      typeof event.completedAt === "string"
        ? event.completedAt
        : typeof event.startedAt === "string"
          ? event.startedAt
          : "";
    return {
      dedupeKey: id ? `zcode:${id}` : "",
      input,
      output,
      cachedInput,
      total,
      timestamp,
      model,
    };
  }
}
