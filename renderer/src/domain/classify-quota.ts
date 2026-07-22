/**
 * classify-quota — 把 ClientSnapshot.limits 分类为 QuotaState 和窗口视图模型。
 *
 * Codex 的 limits 来自 server/normalize.ts 的 normalizeRateLimits，可能含 0-N 个
 * QuotaWindow。每个窗口的 windowMinutes：
 * - 300 → "5 小时"（five-hour）
 * - 10080 → "每周"（weekly）
 * - 其他（含 null）→ 保留为 "other"，label 由 server 端 labelWindow 生成
 *   （如 "1 天"、"2 小时"、"90 分钟"、"未标明窗口"）
 *
 * ⚠️ server 端不丢弃未知 windowMinutes 的窗口（normalize.ts:86 只过滤缺失/非对象窗口），
 * 所以这里也不能丢。未知窗口必须保留并动态显示，否则会丢失用户实际看到的配额信息。
 */

import type { QuotaWindow } from "../../../server/types.js";
import type {
  ClientKind,
  Health,
  QuotaState,
  QuotaWindowKind,
  QuotaWindowViewModel,
} from "./types.js";
import { classifyHealth } from "./classify-health.js";

/** 把 windowMinutes 映射到窗口类型；未知分钟数或 null 都归为 "other"。 */
export function classifyWindowKind(windowMinutes: number | null): QuotaWindowKind {
  if (windowMinutes === 300) return "five-hour";
  if (windowMinutes === 10080) return "weekly";
  return "other";
}

/** 把单个 QuotaWindow 转成视图模型。所有窗口都被保留（包括 other）。 */
export function toQuotaWindowViewModel(window: QuotaWindow): QuotaWindowViewModel {
  const kind = classifyWindowKind(window.windowMinutes);
  return {
    kind,
    label: window.label,
    usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent,
    health: classifyHealth(window.remainingPercent),
    resetsAt: window.resetsAt,
    quality: window.quality,
  };
}

/**
 * 把 limits 数组分类为 QuotaState。
 * - 空 → unavailable
 * - 同时含 5h 和 weekly → dual
 * - 只有 5h → five-only
 * - 只有 weekly → weekly-only
 * - 只含 other（无 5h/weekly）→ unavailable
 *
 * 说明：QuotaState 描述"主+次配额窗口的已知组合"，用于 Card 的 Hero/Side 布局决策。
 * other 窗口不属于任何已知布局，所以即使存在，QuotaState 仍归为 unavailable
 * （主/次配额区域显示"服务未提供"）。但 other 窗口本身仍保留在 extra 里，
 * 由组件在合适位置动态显示，不丢失信息。
 */
export function classifyQuotaState(limits: QuotaWindow[]): QuotaState {
  const hasFive = limits.some((w) => classifyWindowKind(w.windowMinutes) === "five-hour");
  const hasWeekly = limits.some((w) => classifyWindowKind(w.windowMinutes) === "weekly");
  if (hasFive && hasWeekly) return "dual";
  if (hasFive) return "five-only";
  if (hasWeekly) return "weekly-only";
  return "unavailable";
}

/** pickQuotaWindows 的返回结构。 */
export interface PickedQuotaWindows {
  primary: QuotaWindowViewModel | null;
  secondary: QuotaWindowViewModel | null;
  /**
   * 未归入 primary/secondary 的窗口（kind="other" 的全部）。
   * 组件应在某处动态显示，不丢失 server 返回的配额信息。
   */
  extra: QuotaWindowViewModel[];
}

/**
 * 选出主/次配额窗口 + 剩余 extra 窗口。
 * - Dual: primary = 5h, secondary = weekly
 * - WeeklyOnly: primary = weekly, secondary = null
 * - FiveOnly: primary = 5h, secondary = null
 * - Unavailable (含只有 other 窗口): primary = null, secondary = null
 *
 * 这与 visual-spec.md §5 的 Card 状态矩阵一致（Dual 时 5h 在左 Hero，weekly 在右）。
 * primary/secondary 只从已知窗口类型里选；other 窗口全部进 extra。
 */
export function pickQuotaWindows(limits: QuotaWindow[]): PickedQuotaWindows {
  const all = limits.map(toQuotaWindowViewModel);
  const five = all.find((w) => w.kind === "five-hour") ?? null;
  const weekly = all.find((w) => w.kind === "weekly") ?? null;
  const state = classifyQuotaState(limits);

  switch (state) {
    case "dual":
      return {
        primary: five,
        secondary: weekly,
        extra: all.filter((w) => w.kind === "other"),
      };
    case "five-only":
      return {
        primary: five,
        secondary: null,
        extra: all.filter((w) => w.kind === "other"),
      };
    case "weekly-only":
      return {
        primary: weekly,
        secondary: null,
        extra: all.filter((w) => w.kind === "other"),
      };
    case "unavailable":
      // 所有窗口（包括 other）都不进 primary/secondary，全部进 extra
      return { primary: null, secondary: null, extra: all };
  }
}

/**
 * 计算客户端整体健康度：取主配额窗口的健康度；无配额时返回 unavailable。
 * 注意：对 ZCode 而言永远返回 unavailable（无配额）。
 */
export function pickClientHealth(
  primary: QuotaWindowViewModel | null,
  clientKind: ClientKind,
): Health {
  if (clientKind === "zcode") return "unavailable";
  return primary?.health ?? "unavailable";
}
