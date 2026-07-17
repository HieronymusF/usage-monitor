import { homedir } from "node:os";
import { join } from "node:path";
import { CodexSessionLogReader } from "./sources/codexSessionLog.js";
import type { LocalUsageResult } from "./types.js";

/**
 * Backward-compatible facade over {@link CodexSessionLogReader}.
 *
 * The original LocalSessionReader scanned ~/.codex/sessions and aggregated the
 * monotonic total_tokens counter. That logic now lives in the shared
 * SessionLogReader base class via CodexSessionLogReader. This thin wrapper keeps
 * the old constructor shape (sessionsRoot / cachePath / now / retentionDays) so
 * existing callers and tests keep working while the rest of the codebase talks
 * to the multi-client source architecture.
 */
export interface LocalSessionReaderOptions {
  sessionsRoot?: string;
  cachePath?: string;
  now?: () => Date;
  retentionDays?: number;
}

export class LocalSessionReader {
  private readonly reader: CodexSessionLogReader;

  constructor(options: LocalSessionReaderOptions = {}) {
    this.reader = new CodexSessionLogReader({
      ...(options.sessionsRoot ? { logRoot: options.sessionsRoot } : {}),
      ...(options.cachePath ? { cachePath: options.cachePath } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.retentionDays ? { retentionDays: options.retentionDays } : {}),
    });
  }

  async read(days = 30): Promise<LocalUsageResult> {
    return this.reader.read(days);
  }

  /** Test hook retained from the original API; the facade does not support it. */
  async readFileIncrement(): Promise<never> {
    throw new Error("not supported on facade");
  }
}

// Keep the home join referenced for documentation of the default path even
// though the default now lives in CodexSessionLogReader.
void homedir;
void join;
