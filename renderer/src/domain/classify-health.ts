/**
 * classify-health — 按 remainingPercent 计算健康度。
 *
 * 阈值（DEVELOPMENT-PLAN.md §6）：
 * - >= 50 → sufficient（充足）
 * - 20–49 → low（偏低）
 * - < 20  → critical（紧张）
 * - null  → unavailable（无配额数据）
 *
 * 状态文字（充足/偏低/紧张）和颜色（绿/黄/红）必须同时表达，
 * 不只靠颜色（visual-spec.md §4、AGENTS.md 无障碍要求）。
 */

import type { Health } from "./types.js";

export function classifyHealth(remainingPercent: number | null): Health {
  if (remainingPercent === null) return "unavailable";
  if (remainingPercent >= 50) return "sufficient";
  if (remainingPercent >= 20) return "low";
  return "critical";
}
