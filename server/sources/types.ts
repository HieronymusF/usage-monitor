import type { ClientSnapshot, UsageWarning } from "../types.js";

/**
 * A single client that can report usage data (Codex, ZCode, ...).
 *
 * Implementations own their own data sources (app-server, local logs) and their
 * own retry/backoff. A failing source must NOT block sibling sources: on failure
 * it returns its last snapshot marked stale plus a warning.
 */
export interface ClientUsageSource {
  /** Stable id, e.g. "codex" / "zcode". */
  readonly clientId: string;
  /** Human label for cards and overlays. */
  readonly displayName: string;
  /** True if any data source for this client is present on this machine. */
  readonly available: boolean;

  /** Force or coalesced refresh; returns this client's snapshot. */
  refresh(force?: boolean): Promise<ClientSnapshot>;

  /** Latest cached snapshot, refreshing on demand when missing. */
  getSnapshot(): Promise<ClientSnapshot>;

  /** 1-90 day history from local logs, labeled as local estimate. */
  getHistory(days: number): Promise<{
    days: number;
    daily: { date: string; tokens: number }[];
    source: string;
    quality: string;
    warnings: UsageWarning[];
  }>;

  /** Optional: hook for polling start. Sources without event sources are no-ops. */
  startPolling(): void;

  /** Release child processes, timers, listeners. */
  close(): void;
}

/**
 * A record extracted from a single line of a session log. `null` means the line
 * carries no token data. Subclasses of SessionLogReader produce these; the base
 * class handles aggregation, caching and pruning.
 */
export interface TokenRecord {
  /** Per-file dedupe key. Same key seen twice in one incremental pass is ignored. */
  dedupeKey: string;
  input: number;
  output: number;
  cachedInput: number;
  /** Authoritative contribution of this record to the lifetime total. */
  total: number;
  /** ISO timestamp (or date prefix) used to bucket per-day. */
  timestamp: string;
  /** Model name if the log carries one (ZCode logs do). */
  model: string | null;
}

/**
 * Accumulator written to and read from the per-client cache file. Shared shape
 * lets the base class handle all persistence regardless of the underlying log
 * format.
 */
export interface LogCacheState {
  schemaVersion: 2;
  updatedAt: string;
  lifetimeInput: number;
  lifetimeOutput: number;
  lifetimeCachedInput: number;
  /** Authoritative total, accumulated from each record's true contribution. */
  lifetimeTotal: number;
  daily: Record<string, { input: number; output: number; cachedInput: number; total: number }>;
  models: Record<string, { input: number; output: number }>;
  files: Record<string, { offset: number; cursor?: number }>;
}

export const emptyLogCache = (): LogCacheState => ({
  schemaVersion: 2,
  updatedAt: new Date(0).toISOString(),
  lifetimeInput: 0,
  lifetimeOutput: 0,
  lifetimeCachedInput: 0,
  lifetimeTotal: 0,
  daily: {},
  models: {},
  files: {},
});
