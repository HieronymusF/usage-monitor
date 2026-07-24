import type {
  QuotaWindow,
  RawRateLimitBucket,
  RawRateLimitsResponse,
  RawRateLimitWindow,
  ThreadTokenUsage,
  TokenUsage,
  UsageSource,
  UsageWarning,
} from "./types.js";

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export function labelWindow(minutes: number | null): string {
  if (minutes === 300) return "5 小时";
  if (minutes === 10_080) return "每周";
  if (minutes === null) return "未标明窗口";
  if (minutes % 1_440 === 0) return `${minutes / 1_440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function isoFromUnix(value: unknown): string | null {
  const seconds = numberOrNull(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeWindow(
  bucketId: string,
  raw: RawRateLimitWindow,
  index: number,
  warnings: UsageWarning[],
  source: UsageSource,
): QuotaWindow {
  const minutes = numberOrNull(raw.windowDurationMins ?? raw.window_minutes);
  const originalPercent = numberOrNull(raw.usedPercent ?? raw.used_percent);
  let usedPercent = originalPercent;
  if (originalPercent !== null && (originalPercent < 0 || originalPercent > 100)) {
    usedPercent = Math.min(100, Math.max(0, originalPercent));
    warnings.push({
      code: "INVALID_PERCENT",
      message: `${bucketId} 的已用比例超出 0–100，已安全截断。`,
    });
  }
  const remainingPercent = usedPercent === null ? null : Math.min(100, Math.max(0, 100 - usedPercent));
  const resetsAt = isoFromUnix(raw.resetsAt ?? raw.resets_at);
  if (resetsAt === null) {
    warnings.push({ code: "RESET_TIME_UNAVAILABLE", message: `${bucketId} 的重置时间未提供。` });
  }
  return {
    id: `${bucketId}:${minutes ?? `unknown-${index}`}`,
    label: labelWindow(minutes),
    windowMinutes: minutes,
    usedPercent,
    remainingPercent,
    resetsAt,
    source,
    quality: usedPercent === null ? "unavailable" : "derived",
  };
}

export function normalizeRateLimits(
  raw: RawRateLimitsResponse,
  source: UsageSource = "app_server",
): {
  limits: QuotaWindow[];
  planType: string | null;
  warnings: UsageWarning[];
} {
  const warnings: UsageWarning[] = [];
  const buckets = new Map<string, RawRateLimitBucket>();
  if (raw.rateLimitsByLimitId && typeof raw.rateLimitsByLimitId === "object") {
    for (const [id, bucket] of Object.entries(raw.rateLimitsByLimitId)) buckets.set(id, bucket);
  }
  if (buckets.size === 0 && raw.rateLimits) {
    const id = stringOrNull(raw.rateLimits.limitId ?? raw.rateLimits.limit_id) ?? "default";
    buckets.set(id, raw.rateLimits);
  }

  const limits: QuotaWindow[] = [];
  let planType: string | null = null;
  for (const [mapId, bucket] of buckets) {
    const bucketId = stringOrNull(bucket.limitId ?? bucket.limit_id) ?? mapId;
    planType ??= stringOrNull(bucket.planType ?? bucket.plan_type);
    [bucket.primary, bucket.secondary].forEach((window, index) => {
      if (window && typeof window === "object") {
        limits.push(normalizeWindow(bucketId, window, index, warnings, source));
      }
    });
  }
  if (limits.length === 0) {
    warnings.push({ code: "RATE_LIMITS_UNAVAILABLE", message: "服务未提供配额窗口。" });
  }
  return { limits, planType, warnings };
}

export function normalizeThreadTokenUsage(raw: unknown): ThreadTokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const tokenUsage = (raw as { tokenUsage?: unknown }).tokenUsage ?? raw;
  if (!tokenUsage || typeof tokenUsage !== "object") return null;
  const total = (tokenUsage as { total?: unknown }).total ?? tokenUsage;
  if (!total || typeof total !== "object") return null;
  const value = total as Record<string, unknown>;
  const input = numberOrNull(value.inputTokens ?? value.input_tokens);
  const cachedInput = numberOrNull(value.cachedInputTokens ?? value.cached_input_tokens);
  const output = numberOrNull(value.outputTokens ?? value.output_tokens);
  const reasoningOutput = numberOrNull(value.reasoningOutputTokens ?? value.reasoning_output_tokens);
  const totalTokens = numberOrNull(value.totalTokens ?? value.total_tokens);
  if ([input, cachedInput, output, reasoningOutput, totalTokens].some((v) => v === null)) return null;
  return {
    input: input as number,
    cachedInput: cachedInput as number,
    output: output as number,
    reasoningOutput: reasoningOutput as number,
    total: totalTokens as number,
  };
}

export function threadUsageToModel(value: ThreadTokenUsage): TokenUsage {
  return {
    ...value,
    lifetimeTotal: null,
    daily: null,
    source: "thread_event",
    quality: "official",
  };
}

export function normalizeAccountUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const summary = (value.tokenUsage ?? value.usage ?? value.summary ?? value) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const n = numberOrNull(summary[key]);
      if (n !== null) return n;
    }
    return null;
  };
  const dailyRaw = value.dailyUsageBuckets ?? value.daily ?? summary.daily;
  const daily = Array.isArray(dailyRaw)
    ? dailyRaw.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const date = stringOrNull(row.date ?? row.day);
        const tokens = numberOrNull(row.tokens ?? row.totalTokens ?? row.total_tokens);
        return date && tokens !== null ? [{ date, tokens }] : [];
      })
    : null;
  const input = pick("inputTokens", "input_tokens", "input");
  const cachedInput = pick("cachedInputTokens", "cached_input_tokens", "cachedInput");
  const output = pick("outputTokens", "output_tokens", "output");
  const reasoningOutput = pick("reasoningOutputTokens", "reasoning_output_tokens", "reasoningOutput");
  const total = pick("totalTokens", "total_tokens", "total");
  const lifetimeTotal = pick("lifetimeTotal", "lifetime_total");
  if ([input, cachedInput, output, reasoningOutput, total, lifetimeTotal].every((n) => n === null) && !daily?.length) {
    return null;
  }
  return {
    input,
    cachedInput,
    output,
    reasoningOutput,
    total,
    lifetimeTotal,
    daily,
    source: "account_usage",
    quality: "official",
  };
}

export function unavailableTokenUsage(): TokenUsage {
  return {
    input: null,
    cachedInput: null,
    output: null,
    reasoningOutput: null,
    total: null,
    lifetimeTotal: null,
    daily: null,
    source: "none",
    quality: "unavailable",
  };
}
