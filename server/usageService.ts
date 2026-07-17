import type { ClientSnapshot, MultiClientSnapshot, UsageWarning } from "./types.js";
import type { ClientUsageSource } from "./sources/types.js";
import { coalesceWarnings } from "./warnings.js";

/**
 * Aggregates multiple {@link ClientUsageSource}s (Codex, ZCode) into one
 * snapshot. Each source owns its own refresh, retry and backoff; this service
 * only fans out refresh requests and merges results. A failing source degrades
 * itself (returns a stale snapshot + warning) and never blocks its siblings.
 *
 * Refresh requests started within five seconds are coalesced globally.
 */
export class MultiClientUsageService {
  private snapshot: MultiClientSnapshot | null = null;
  private refreshPromise: Promise<MultiClientSnapshot> | null = null;
  private lastRefreshStart = 0;
  private readonly now: () => Date;

  constructor(
    private readonly sources: ClientUsageSource[],
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async getSnapshot(): Promise<MultiClientSnapshot> {
    if (!this.snapshot) return this.refresh(true);
    if (this.now().getTime() <= Date.parse(this.snapshot.staleAfter)) return this.snapshot;
    if (this.snapshot.warnings.some((w) => w.code === "STALE")) return this.snapshot;
    return { ...this.snapshot, warnings: [...this.snapshot.warnings, { code: "STALE", message: "数据超过 2 分钟，可能已过期。" }] };
  }

  async refresh(force = true): Promise<MultiClientSnapshot> {
    const nowMs = this.now().getTime();
    if (this.refreshPromise) return this.refreshPromise;
    if (force && this.snapshot && nowMs - this.lastRefreshStart < 5_000) return this.snapshot;
    this.lastRefreshStart = nowMs;
    this.refreshPromise = this.performRefresh(force).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh(force: boolean): Promise<MultiClientSnapshot> {
    const fetchedAt = this.now();
    const clients: Record<string, ClientSnapshot> = {};
    const warnings: UsageWarning[] = [];
    const results = await Promise.all(
      this.sources.map(async (source) => {
        try {
          return await source.refresh(force);
        } catch (error) {
          warnings.push({
            code: "SOURCE_REFRESH_FAILED",
            message: `${source.displayName} 用量刷新失败：${error instanceof Error ? error.message : "unknown"}。`,
          });
          return null;
        }
      }),
    );
    for (const result of results) {
      if (result) {
        clients[result.clientId] = result;
        warnings.push(...result.warnings);
      }
    }
    this.snapshot = {
      schemaVersion: 2,
      fetchedAt: fetchedAt.toISOString(),
      staleAfter: new Date(fetchedAt.getTime() + 120_000).toISOString(),
      clients,
      warnings: coalesceWarnings(warnings),
    };
    return this.snapshot;
  }

  async getHistory(clientId: string, days: number): Promise<{
    clientId: string;
    days: number;
    daily: { date: string; tokens: number }[];
    source: string;
    quality: string;
    warnings: UsageWarning[];
  }> {
    const source = this.sources.find((item) => item.clientId === clientId);
    if (!source) {
      return {
        clientId,
        days: Math.min(90, Math.max(1, Math.trunc(days))),
        daily: [],
        source: "none",
        quality: "unavailable",
        warnings: [{ code: "UNKNOWN_CLIENT", message: `未注册的客户端：${clientId}。` }],
      };
    }
    const history = await source.getHistory(days);
    return { clientId: source.clientId, ...history };
  }

  /** Propagate visibility to sources that use it for poll interval. */
  setVisible(visible: boolean): void {
    for (const source of this.sources) {
      const maybe = source as unknown as { setVisible?: (v: boolean) => void };
      maybe.setVisible?.(visible);
    }
  }

  startPolling(): void {
    for (const source of this.sources) source.startPolling();
    void this.refresh(true);
  }

  close(): void {
    for (const source of this.sources) source.close();
  }
}
