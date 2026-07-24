export type UsageSource =
  | "app_server"
  | "account_usage"
  | "thread_event"
  | "local_session"
  | "none";

export type UsageQuality = "official" | "derived" | "local_estimate" | "unavailable";

export interface UsageWarning {
  code: string;
  message: string;
}

export interface QuotaWindow {
  id: string;
  label: string;
  windowMinutes: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetsAt: string | null;
  source: UsageSource;
  quality: UsageQuality;
}

export interface DailyUsage {
  date: string;
  tokens: number;
}

export interface TokenUsage {
  input: number | null;
  cachedInput: number | null;
  output: number | null;
  reasoningOutput: number | null;
  total: number | null;
  lifetimeTotal: number | null;
  daily: DailyUsage[] | null;
  source: UsageSource;
  quality: UsageQuality;
}

/** Per-model breakdown. Used by ZCode (and any client whose logs carry a model field). */
export interface ModelUsage {
  name: string;
  input: number;
  output: number;
}

/**
 * Snapshot for a single client (e.g. Codex, ZCode).
 * - Codex fills `limits` and `planType` from the app-server; ZCode leaves them empty.
 * - `available=false` means we detected no data source for this client.
 */
export interface ClientSnapshot {
  clientId: string;
  displayName: string;
  available: boolean;
  fetchedAt: string;
  staleAfter: string;
  planType: string | null;
  /** How the client is billed: "subscription" / "api_key" / null when unknown. */
  billingMode: string | null;
  limits: QuotaWindow[];
  tokenUsage: TokenUsage;
  models: ModelUsage[] | null;
  warnings: UsageWarning[];
}

/**
 * Aggregate snapshot across all clients. schemaVersion bumped to 2 to signal the
 * multi-client shape; the legacy single-client UsageSnapshot is retained below
 * for backward compatibility with normalize/render helpers.
 */
export interface MultiClientSnapshot {
  schemaVersion: 2;
  fetchedAt: string;
  staleAfter: string;
  clients: Record<string, ClientSnapshot>;
  warnings: UsageWarning[];
}

/** Legacy single-client snapshot shape (Codex-only). Kept for helpers and tests. */
export interface UsageSnapshot {
  schemaVersion: 1;
  fetchedAt: string;
  staleAfter: string;
  planType: string | null;
  limits: QuotaWindow[];
  tokenUsage: TokenUsage;
  warnings: UsageWarning[];
}

export interface RawRateLimitWindow {
  usedPercent?: unknown;
  used_percent?: unknown;
  windowDurationMins?: unknown;
  window_minutes?: unknown;
  resetsAt?: unknown;
  resets_at?: unknown;
  [key: string]: unknown;
}

export interface RawRateLimitBucket {
  limitId?: unknown;
  limit_id?: unknown;
  planType?: unknown;
  plan_type?: unknown;
  primary?: RawRateLimitWindow | null;
  secondary?: RawRateLimitWindow | null;
  [key: string]: unknown;
}

export interface RawRateLimitsResponse {
  rateLimits?: RawRateLimitBucket | null;
  rateLimitsByLimitId?: Record<string, RawRateLimitBucket> | null;
  [key: string]: unknown;
}

export interface ThreadTokenUsage {
  input: number;
  cachedInput: number;
  output: number;
  reasoningOutput: number;
  total: number;
}

export interface LocalUsageResult {
  tokenUsage: TokenUsage;
  models: ModelUsage[] | null;
  warnings: UsageWarning[];
}
