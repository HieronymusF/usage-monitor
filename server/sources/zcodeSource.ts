import { existsSync } from "node:fs";
import { ZcodeSessionLogReader } from "./zcodeSessionLog.js";
import { unavailableTokenUsage } from "../normalize.js";
import type { ClientSnapshot, UsageWarning } from "../types.js";
import type { ClientUsageSource } from "./types.js";

/**
 * ZCode client: the desktop application's embedded GLM app-server writes local
 * model-I/O logs but exposes no official quota interface consumed here. This
 * source reports ONLY local-estimate token statistics (today / lifetime /
 * per-day / per-model). It never invents quota windows, reset times or remaining
 * percentages. `available` reflects whether the model-I/O log directory is
 * present on this machine. Settings and request/response content are not read.
 */
export class ZcodeSource implements ClientUsageSource {
  readonly clientId = "zcode";
  readonly displayName = "ZCode";
  readonly available: boolean;

  private snapshot: ClientSnapshot | null = null;
  private refreshPromise: Promise<ClientSnapshot> | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;

  constructor(
    private readonly logReader: ZcodeSessionLogReader,
    options: { now?: () => Date; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout; logRoot?: string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.available = existsSync(options.logRoot ?? ZcodeSource.defaultLogRoot());
  }

  static defaultLogRoot(): string {
    return ZcodeSessionLogReader.defaultRoot();
  }

  async getSnapshot(): Promise<ClientSnapshot> {
    if (!this.snapshot) return this.refresh();
    return this.snapshot;
  }

  async refresh(_force?: boolean): Promise<ClientSnapshot> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<ClientSnapshot> {
    const fetchedAt = this.now();
    const local = await this.logReader.read(30);
    const staleAfter = new Date(fetchedAt.getTime() + 120_000).toISOString();
    const warnings: UsageWarning[] = [...local.warnings];
    if (!local.tokenUsage.lifetimeTotal && !(local.tokenUsage.daily ?? []).length) {
      warnings.unshift({ code: "ZCODE_NO_SESSIONS", message: "未检测到 ZCode 会话日志。" });
    } else {
      warnings.unshift({ code: "LOCAL_ESTIMATE_ONLY", message: "ZCode 无官方配额接口；以下为会话日志的本机估算。" });
    }
    this.snapshot = {
      clientId: this.clientId,
      displayName: this.displayName,
      available: this.available,
      fetchedAt: fetchedAt.toISOString(),
      staleAfter,
      planType: null,
      billingMode: null,
      limits: [],
      tokenUsage: local.tokenUsage,
      models: local.models,
      warnings,
    };
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
    const local = await this.logReader.read(safeDays);
    return {
      days: safeDays,
      daily: local.tokenUsage.daily ?? [],
      source: "local_session",
      quality: "local_estimate",
      warnings: [
        { code: "LOCAL_HISTORY", message: "ZCode 结果来自本机会话日志的增量统计，无官方配额数据。" },
        ...local.warnings,
      ],
    };
  }

  startPolling(): void {
    const poll = (): void => {
      this.pollTimer = this.setTimer(() => {
        void this.refresh();
        poll();
      }, 60_000);
      this.pollTimer.unref?.();
    };
    void this.refresh();
    poll();
  }

  close(): void {
    if (this.pollTimer) this.clearTimer(this.pollTimer);
    this.pollTimer = null;
  }
}

/** Sentinel snapshot used before the first read completes. */
export function unavailableZcodeSnapshot(): ClientSnapshot {
  return {
    clientId: "zcode",
    displayName: "ZCode",
    available: false,
    fetchedAt: new Date(0).toISOString(),
    staleAfter: new Date(0).toISOString(),
    planType: null,
    billingMode: null,
    limits: [],
    tokenUsage: unavailableTokenUsage(),
    models: null,
    warnings: [],
  };
}

void unavailableZcodeSnapshot;
