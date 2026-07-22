/**
 * UsageViewModel — 领域视图模型
 *
 * Renderer 不直接解释原始 `MultiClientSnapshot`（server/types.ts）。所有 surface
 * 组件只消费这里的稳定视图模型，由纯函数 classifier + formatter 派生而来。
 *
 * 设计依据：
 * - DEVELOPMENT-PLAN.md §6 状态枚举
 * - HANDOFF.md §11 Milestone A 覆盖矩阵
 * - docs/ui-designs/visual-spec.md §5 Card 状态矩阵
 *
 * 红线（AGENTS.md）：
 * - ZCode 永远没有 quota（quotaState 固定 "unavailable"，不显示百分比/倒计时）
 * - Codex 配额缺失时显示"服务未提供"，不显示 0%/100%/估算值
 * - 不在视图模型里伪造数据；缺失字段用 null 表达，由组件决定占位文案
 */

import type {
  ClientSnapshot,
  ModelUsage,
  MultiClientSnapshot,
  QuotaWindow,
  UsageQuality,
} from "../../../server/types.js";

/** 客户端类型，用于决定 quota 渲染策略。 */
export type ClientKind = "codex" | "zcode";

/** Quota 状态分类，仅对 Codex 有意义；ZCode 固定 "unavailable"。 */
export type QuotaState = "dual" | "weekly-only" | "five-only" | "unavailable";

/**
 * 数据生命周期状态。组件据此决定是否显示 stale 提示、错误面板或离线兜底。
 * - loading: 首次加载，尚无任何快照。
 * - fresh: 有快照且未超过 staleAfter。
 * - stale: 有快照但已过 staleAfter（保留上次有效数据 + 过期提示）。
 * - partial: 多客户端时部分源失败（snapshot 仍在，但 warnings 含失败码）。
 * - refresh-error: 刷新失败但保留了上次快照。
 * - offline: bridge 不可达，无快照。
 */
export type DataState = "loading" | "fresh" | "stale" | "partial" | "refresh-error" | "offline";

/**
 * 健康度，按剩余比例分类（DEVELOPMENT-PLAN.md §6）。
 * - sufficient: remaining >= 50
 * - low: 20 <= remaining < 50
 * - critical: 0 <= remaining < 20
 * - unavailable: 无配额数据（ZCode 或 Codex 配额缺失）
 */
export type Health = "sufficient" | "low" | "critical" | "unavailable";

/**
 * 配额窗口类型，按 windowMinutes 区分。
 * - "five-hour": 300 分钟（5 小时窗口）
 * - "weekly": 10080 分钟（每周窗口）
 * - "other": 任何其他分钟数或 null。
 *
 * server/normalize.ts 不会丢弃未知 windowMinutes 的窗口（normalize.ts:86 只过滤
 * 缺失/非对象窗口），labelWindow 会给它生成可读 label（如 "1 天"、"2 小时"、
 * "90 分钟"、"未标明窗口"）。所以 unknown 窗口必须保留，由组件动态显示。
 */
export type QuotaWindowKind = "five-hour" | "weekly" | "other";

/** 重新导出，方便 domain 模块统一引用。 */
export type { ClientSnapshot, ModelUsage, MultiClientSnapshot, QuotaWindow, UsageQuality };

/**
 * 单个配额窗口的视图模型。
 * `usedPercent` / `remainingPercent` 永远是 0-100 的有效数或 null（缺失），
 * 上游 normalize.ts 已经截断过越界值并加 INVALID_PERCENT warning，这里不再处理。
 */
export interface QuotaWindowViewModel {
  kind: QuotaWindowKind;
  /** 原始 label，已由 server 端本地化为中文（"5 小时" / "每周"）。 */
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  /** 健康度，基于 remainingPercent。unavailable 表示 remaining 为 null。 */
  health: Health;
  /** ISO 时间字符串或 null。renderer 据此计算倒计时，不每秒访问 bridge。 */
  resetsAt: string | null;
  /** 配额来源质量，决定是否显示"官方"/"本机估算"标识。 */
  quality: UsageQuality;
}

/** Token 用量视图模型，所有字段允许 null 表达缺失。 */
export interface TokenUsageViewModel {
  /** 当前任务（最新会话）的 total tokens，可能为 null。 */
  currentTask: number | null;
  /**
   * 今日聚合 tokens。
   * server/sessionLogReader.ts 的 daily bucket key 是 ISO timestamp 的前 10 字符
   * （即 UTC 日期，sessionLogReader.ts:194），所以这里也按"当前 UTC 日期"匹配。
   * 取不到匹配 key 时返回 null（不回退到最后一条，避免跨天误显示昨天的数据）。
   */
  today: number | null;
  /** 本机累计 lifetime total。 */
  lifetimeTotal: number | null;
  /** 输入 tokens（含缓存拆分用）。 */
  input: number | null;
  /** 缓存命中 tokens。 */
  cachedInput: number | null;
  /** 输出 tokens。 */
  output: number | null;
  /** 数据质量。 */
  quality: UsageQuality;
  /** 按模型拆分（ZCode 常有，Codex 通常为空）。 */
  models: ModelUsage[];
}

/** 单个客户端的完整视图模型。 */
export interface ClientUsageViewModel {
  kind: ClientKind;
  displayName: string;
  /** 是否检测到任何数据源（available=false 时显示空状态）。 */
  available: boolean;
  /** ISO 时间戳，快照获取时刻。 */
  fetchedAt: string;
  /** 该客户端的 quota 分类；ZCode 固定 "unavailable"。 */
  quotaState: QuotaState;
  /** 主配额窗口（Codex Dual 时是 5h，WeeklyOnly 时是 weekly）。 */
  primaryQuota: QuotaWindowViewModel | null;
  /** 次配额窗口（Codex Dual 时是 weekly）。 */
  secondaryQuota: QuotaWindowViewModel | null;
  /**
   * 未归入 primary/secondary 的额外配额窗口（server 返回的未知 windowMinutes 窗口）。
   * server 端不丢弃这些窗口，组件应在某处动态显示，不丢失信息。
   * ZCode 永远为空数组（ZCode 无配额）。
   */
  extraQuotaWindows: QuotaWindowViewModel[];
  /** Token 用量视图。 */
  tokenUsage: TokenUsageViewModel;
  /** 该客户端的健康度，取主配额的健康度；无配额则 unavailable。 */
  health: Health;
  /** 服务端返回的 warnings（已去重）。 */
  warnings: { code: string; message: string }[];
  /** 计费模式（"subscription" / "api_key" / null）。 */
  billingMode: string | null;
  /** 套餐类型（Codex 有，ZCode 为 null）。 */
  planType: string | null;
}

/**
 * 聚合视图模型，是所有 surface 组件的唯一数据入口。
 *
 * `dataState` 决定形态：
 * - loading / offline: `client` 为 null，组件渲染加载占位或离线面板。
 *   这两种状态的区别由 dataState 表达，不靠 client 是否存在。
 * - fresh / stale / partial / refresh-error: `client` 有值，渲染真实数据
 *   + 对应的 stale/partial/error 提示。
 */
export interface UsageViewModel {
  dataState: DataState;
  /** loading/offline 时为 null；其余状态有值。 */
  client: ClientUsageViewModel | null;
  /** 全局快照时间，loading/offline 时为空字符串。 */
  fetchedAt: string;
  /** 全局 warnings（跨客户端）。 */
  warnings: { code: string; message: string }[];
}
