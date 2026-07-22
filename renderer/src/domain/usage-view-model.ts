/**
 * usage-view-model — 把原始 MultiClientSnapshot 派生为稳定的 UsageViewModel。
 *
 * 这是 renderer 的领域适配层（DEVELOPMENT-PLAN.md §6）。所有 surface 组件
 * 只消费 UsageViewModel，不直接解释 snapshot。
 *
 * 纯函数：不依赖 React、不访问 window.monitor、不访问 localStorage。
 */

import type { ClientSnapshot, MultiClientSnapshot, TokenUsage } from "../../../server/types.js";
import { todayKey as sharedTodayKey } from "../../../server/time.js";
import { classifyDataState } from "./classify-data-state.js";
import type { DataStateInput } from "./classify-data-state.js";
import { classifyHealth } from "./classify-health.js";
import { classifyQuotaState, pickQuotaWindows } from "./classify-quota.js";
import type {
  ClientKind,
  ClientUsageViewModel,
  DataState,
  Health,
  QuotaState,
  TokenUsageViewModel,
  UsageViewModel,
} from "./types.js";

/** 判定 ClientKind。未知 clientId 回退到 codex（避免组件崩溃）。 */
export function toClientKind(clientId: string): ClientKind {
  return clientId === "zcode" ? "zcode" : "codex";
}

/**
 * 生成"今日"的日期 key。
 *
 * 委托给 server/time.ts 的 todayKey，保证与 server/sessionLogReader.ts 的 bucket key
 * 用同一实现（本地自然日，不是 UTC 日）。生产环境跟随系统时区，两端零分歧。
 *
 * 历史问题：之前这里用 toISOString().slice(0,10) 取 UTC 日，与 server 的本地日 bucket
 * 不一致——UTC+8 凌晨 00:00–08:00 之间 renderer 显示"昨日"而 server 分桶已是"今日"。
 *
 * @param now 注入当前时间，便于测试
 * @param timeZone IANA 时区；省略 = 系统本地（生产跟随用户机器）。测试用 "Asia/Hong_Kong" 等保证确定性
 */
export function todayKey(now: () => Date = () => new Date(), timeZone?: string): string {
  return sharedTodayKey({ now, timeZone });
}

/**
 * 提取今日聚合 tokens。
 * daily 由 server/sessionLogReader.ts 按 UTC 日期分桶，key 形如 "2026-07-18"。
 * 这里按当前 UTC 日期精确匹配，不回退到最后一条（避免跨天误显示昨天的数据）。
 */
function extractTodayTokens(
  daily: { date: string; tokens: number }[] | null,
  now: () => Date,
): number | null {
  if (daily === null || daily.length === 0) return null;
  const today = todayKey(now);
  const bucket = daily.find((d) => d.date === today);
  if (bucket === undefined) return null;
  return bucket.tokens;
}

/** 把 TokenUsage 转成视图模型。 */
function toTokenUsageViewModel(
  usage: TokenUsage,
  now: () => Date,
): Omit<TokenUsageViewModel, "models"> {
  return {
    currentTask: usage.total,
    today: extractTodayTokens(usage.daily, now),
    lifetimeTotal: usage.lifetimeTotal,
    input: usage.input,
    cachedInput: usage.cachedInput,
    output: usage.output,
    quality: usage.quality,
  };
}

/**
 * 把单个 ClientSnapshot 转成 ClientUsageViewModel。
 *
 * 红线（AGENTS.md）：ZCode 永远没有配额。这里无条件清空 ZCode 的 primary/secondary/
 * extra，即使 snapshot.limits 非空（理论上 ZcodeSource 不会填 limits，但防御性清空，
 * 避免任何上游 bug 导致 ZCode 显示出虚构配额）。
 */
export function toClientUsageViewModel(
  snapshot: ClientSnapshot,
  now: () => Date = () => new Date(),
): ClientUsageViewModel {
  const kind = toClientKind(snapshot.clientId);
  const picked = pickQuotaWindows(snapshot.limits);

  if (kind === "zcode") {
    // 红线：ZCode 无条件清空所有配额窗口，quotaState 固定 unavailable
    return {
      kind,
      displayName: snapshot.displayName,
      available: snapshot.available,
      fetchedAt: snapshot.fetchedAt,
      quotaState: "unavailable",
      primaryQuota: null,
      secondaryQuota: null,
      extraQuotaWindows: [],
      tokenUsage: {
        ...toTokenUsageViewModel(snapshot.tokenUsage, now),
        models: snapshot.models ?? [],
      },
      health: "unavailable",
      warnings: snapshot.warnings,
      billingMode: snapshot.billingMode,
      planType: snapshot.planType,
    };
  }

  // Codex：保留 classify 的结果
  const quotaState: QuotaState = classifyQuotaState(snapshot.limits);
  const health: Health = classifyHealth(picked.primary?.remainingPercent ?? null);

  return {
    kind,
    displayName: snapshot.displayName,
    available: snapshot.available,
    fetchedAt: snapshot.fetchedAt,
    quotaState,
    primaryQuota: picked.primary,
    secondaryQuota: picked.secondary,
    extraQuotaWindows: picked.extra,
    tokenUsage: {
      ...toTokenUsageViewModel(snapshot.tokenUsage, now),
      models: snapshot.models ?? [],
    },
    health,
    warnings: snapshot.warnings,
    billingMode: snapshot.billingMode,
    planType: snapshot.planType,
  };
}

/** 当 activeClient 在 snapshot 里不存在时，回退到第一个可用客户端。 */
export function pickClientSnapshot(
  snapshot: MultiClientSnapshot,
  activeClientId: string,
): ClientSnapshot {
  const direct = snapshot.clients[activeClientId];
  if (direct !== undefined) return direct;

  // 回退顺序：codex → zcode → 第一个可用 → 第一个（任意）
  const fallback =
    snapshot.clients["codex"] ??
    snapshot.clients["zcode"] ??
    Object.values(snapshot.clients).find((c) => c.available) ??
    Object.values(snapshot.clients)[0];
  // Object.values 的 find 不会命中 undefined（snapshot 至少有一个 client），但 TS
  // noUncheckedIndexedAccess 让 Object.values()[0] 是 T | undefined，这里做防御。
  if (fallback === undefined) {
    throw new Error("MultiClientSnapshot has no clients");
  }
  return fallback;
}

/**
 * 主入口：把 snapshot + UI 状态组装成 UsageViewModel。
 *
 * 始终返回非 null 的 UsageViewModel。loading/offline 时 client=null，
 * 组件据此渲染对应占位；其余状态 client 有值。
 *
 * @param input.snapshot 当前快照（可能为 null，如 bridge 不可达）
 * @param input.error    最近一次错误（SWR error）
 * @param input.activeClientId 用户选择的客户端
 * @param input.now      注入时间，便于测试
 */
export function toUsageViewModel(input: {
  snapshot: MultiClientSnapshot | null;
  error: unknown;
  activeClientId: string;
  now?: () => Date;
}): UsageViewModel {
  const { snapshot, error, activeClientId } = input;
  const now = input.now ?? (() => new Date());

  // 无快照：loading 或 offline，client=null
  if (snapshot === null) {
    const { state } = classifyDataState({ snapshot, error, now });
    return {
      dataState: state,
      client: null,
      fetchedAt: "",
      warnings: [],
    };
  }

  const clientSnapshot = pickClientSnapshot(snapshot, activeClientId);
  const client = toClientUsageViewModel(clientSnapshot, now);
  // exactOptionalPropertyTypes 不允许把 `now?: () => Date` 当作 `now: (() => Date) | undefined`
  // 传入；只在显式提供时透传。
  const dataStateInput: DataStateInput = { snapshot, error };
  dataStateInput.now = now;
  const { state: dataState } = classifyDataState(dataStateInput) as { state: DataState };

  return {
    dataState,
    client,
    fetchedAt: snapshot.fetchedAt,
    warnings: snapshot.warnings,
  };
}
