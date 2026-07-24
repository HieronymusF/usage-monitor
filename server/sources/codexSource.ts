import { AppServerClient, AppServerError } from "../appServerClient.js";
import { CodexSessionLogReader } from "./codexSessionLog.js";
import {
  normalizeAccountUsage,
  normalizeRateLimits,
  threadUsageToModel,
} from "../normalize.js";
import type { ClientSnapshot, RawRateLimitBucket, TokenUsage, UsageWarning } from "../types.js";
import type { ClientUsageSource } from "./types.js";
import { coalesceWarnings } from "../warnings.js";

/**
 * Codex client: combines the official app-server (rate limits, account usage,
 * thread token events) with a local-session fallback. Encapsulates the retry /
 * backoff and event-subscription logic that previously lived in UsageService,
 * now exposed through the shared {@link ClientUsageSource} interface so the
 * multi-client service can aggregate it alongside ZCode.
 */
export class CodexSource implements ClientUsageSource {
  readonly clientId = "codex";
  readonly displayName = "Codex";
  readonly available: boolean;

  private snapshot: ClientSnapshot | null = null;
  private refreshPromise: Promise<ClientSnapshot> | null = null;
  private lastRefreshStart = 0;
  private failureCount = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private visible = true;
  private readonly now: () => Date;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;

  constructor(
    private readonly client: AppServerClient,
    private readonly logReader: CodexSessionLogReader,
    options: { now?: () => Date; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.available = true; // app-server is tried lazily; availability surfaces as warnings
    client.on("rateLimitsUpdated", (raw: RawRateLimitBucket) => this.applyRateLimitNotification(raw));
    client.on("threadTokenUsageUpdated", () => void this.refresh(false));
    client.on("warning", (warning: UsageWarning) => this.appendWarning(warning));
  }

  async getSnapshot(): Promise<ClientSnapshot> {
    if (!this.snapshot) return this.refresh(true);
    return this.withStaleState(this.snapshot);
  }

  async refresh(force = true): Promise<ClientSnapshot> {
    const nowMs = this.now().getTime();
    if (this.refreshPromise) return this.refreshPromise;
    if (force && this.snapshot && nowMs - this.lastRefreshStart < 5_000) return this.withStaleState(this.snapshot);
    this.lastRefreshStart = nowMs;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<ClientSnapshot> {
    const fetchedAt = this.now();
    const warnings: UsageWarning[] = [];

    // Local session logs are the always-available data source and work for both
    // the Codex CLI and the Codex desktop client (they share ~/.codex/sessions).
    // Read them first so the snapshot is useful even without an app-server.
    const local = await this.logReader.read(30);
    warnings.push(...local.warnings);
    // Local aggregation is lifetime usage, not the currently open task. Keep
    // the lifetime/daily fields but do not mislabel the aggregate as current.
    let tokenUsage: TokenUsage = { ...local.tokenUsage, total: null };

    // Quota comes only from the public app-server surface. Authentication stays
    // inside Codex; this plugin never reads or forwards login credentials.
    let planType: string | null = null;
    let limits: ClientSnapshot["limits"] = [];
    let quotaOk = false;

    try {
      const rate = normalizeRateLimits(await this.client.readRateLimits());
      warnings.push(...rate.warnings);
      planType = rate.planType;
      limits = rate.limits;
      quotaOk = true;
    } catch (error) {
      warnings.push(this.warningFromError(error));
      const persistedRate = await this.logReader.readLatestRateLimits();
      if (persistedRate) {
        const rate = normalizeRateLimits(persistedRate.response, "local_session");
        warnings.push(...rate.warnings);
        planType = rate.planType;
        limits = rate.limits;
        quotaOk = limits.length > 0;
        warnings.push({
          code: "LOCAL_RATE_LIMIT_FALLBACK",
          message: "独立 app-server 不可用，已使用 Codex 桌面端写入的最近官方配额快照。",
        });
      }
    }

    try {
      const accountUsage = normalizeAccountUsage(await this.client.readAccountUsage());
      if (accountUsage) {
        tokenUsage = accountUsage;
      } else {
        if (this.client.usageCapability === false) {
          warnings.push({ code: "ACCOUNT_USAGE_UNSUPPORTED", message: "当前 Codex 不支持账户 Token 接口，已使用可用的降级数据。" });
        }
        if (this.client.threadUsage) {
          const thread = threadUsageToModel(this.client.threadUsage);
          tokenUsage = { ...thread, lifetimeTotal: local.tokenUsage.lifetimeTotal, daily: local.tokenUsage.daily };
        }
      }
    } catch (error) {
      warnings.push(this.warningFromError(error));
    }

    const hasData = (tokenUsage.lifetimeTotal ?? 0) > 0 || (tokenUsage.daily?.length ?? 0) > 0;
    this.failureCount = quotaOk ? 0 : this.failureCount + 1;
    this.snapshot = {
      clientId: this.clientId,
      displayName: this.displayName,
      // Available as long as we have any token data, regardless of app-server.
      available: quotaOk || hasData,
      fetchedAt: fetchedAt.toISOString(),
      staleAfter: new Date(fetchedAt.getTime() + (quotaOk ? 120_000 : 60_000)).toISOString(),
      planType,
      billingMode: "subscription",
      limits,
      tokenUsage,
      models: null,
      warnings: coalesceWarnings(warnings),
    };
    if (quotaOk) {
      this.schedulePoll();
    } else {
      this.schedulePoll(this.failureCount > 1 ? 60_000 : 30_000);
    }
    return this.snapshot;
  }

  async getHistory(days: number): Promise<{
    days: number;
    daily: { date: string; tokens: number }[];
    source: string;
    quality: string;
    warnings: UsageWarning[];
  }> {
    const safeDays = Math.min(90, Math.max(1, Math.trunc(days)));
    const snapshot = await this.getSnapshot();
    if (snapshot.tokenUsage.source === "account_usage" && snapshot.tokenUsage.daily) {
      return {
        days: safeDays,
        daily: snapshot.tokenUsage.daily.slice(-safeDays),
        source: "account_usage",
        quality: "official",
        warnings: [],
      };
    }
    const local = await this.logReader.read(safeDays);
    return {
      days: safeDays,
      daily: local.tokenUsage.daily ?? [],
      source: "local_session",
      quality: "local_estimate",
      warnings: [
        { code: "LOCAL_HISTORY", message: "账户历史不可用；结果来自本机 session 的 token_count 增量统计。" },
        ...local.warnings,
      ],
    };
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.schedulePoll();
  }

  startPolling(): void {
    void this.refresh(true);
  }

  private applyRateLimitNotification(raw: RawRateLimitBucket): void {
    const normalized = normalizeRateLimits({ rateLimits: raw });
    const fetchedAt = this.now();
    if (!this.snapshot) {
      void this.refresh(false);
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      staleAfter: new Date(fetchedAt.getTime() + 120_000).toISOString(),
      planType: normalized.planType ?? this.snapshot.planType,
      limits: normalized.limits,
      warnings: [...this.snapshot.warnings.filter((w) => w.code !== "RATE_LIMITS_UNAVAILABLE"), ...normalized.warnings],
    };
  }

  private schedulePoll(delay?: number): void {
    if (this.pollTimer) this.clearTimer(this.pollTimer);
    const interval = delay ?? (this.visible ? 60_000 : 300_000);
    this.pollTimer = this.setTimer(() => void this.refresh(false), interval);
    this.pollTimer.unref?.();
  }

  private warningFromError(error: unknown): UsageWarning {
    if (error instanceof AppServerError) {
      const messages: Record<string, string> = {
        CODEX_NOT_FOUND: "未找到 codex 命令；请安装 Codex CLI 或设置 CODEX_PATH。",
        AUTH_REQUIRED: "当前未登录，或认证方式不提供 ChatGPT 配额；请在 Codex 中登录。",
        METHOD_NOT_SUPPORTED: "当前 Codex 不支持所请求的方法。",
        APP_SERVER_TIMEOUT: "app-server 请求超时，已保留上次快照并安排重试。",
        APP_SERVER_EXITED: "app-server 已退出，下一次刷新会自动重启。",
      };
      return { code: error.code, message: messages[error.code] ?? "app-server 读取失败，已保留上次快照。" };
    }
    return { code: "REFRESH_FAILED", message: "用量刷新失败，已保留上次快照并安排重试。" };
  }

  private appendWarning(warning: UsageWarning): void {
    if (!this.snapshot) return;
    this.snapshot = { ...this.snapshot, warnings: [...this.snapshot.warnings, warning] };
  }

  private withStaleState(snapshot: ClientSnapshot): ClientSnapshot {
    if (this.now().getTime() <= Date.parse(snapshot.staleAfter)) return snapshot;
    if (snapshot.warnings.some((w) => w.code === "STALE")) return snapshot;
    return { ...snapshot, warnings: [...snapshot.warnings, { code: "STALE", message: "数据超过 2 分钟，可能已过期。" }] };
  }

  close(): void {
    if (this.pollTimer) this.clearTimer(this.pollTimer);
    this.pollTimer = null;
    this.client.close();
  }
}

/** Narrow a TokenUsage for callers that only need the legacy shape. */
export type { TokenUsage };
