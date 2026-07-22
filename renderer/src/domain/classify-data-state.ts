/**
 * classify-data-state — 把快照生命周期、错误和 warnings 映射到 DataState。
 *
 * 规则（DEVELOPMENT-PLAN.md §6, §11）：
 * - 无快照 + 有错误 → offline（bridge 不可达）
 * - 无快照 + 无错误 → loading（首次加载）
 * - 有快照 + 刷新错误 → refresh-error（保留上次有效数据）
 * - 有快照 + 已过 staleAfter → stale（保留上次有效数据 + 过期提示）
 * - 有快照 + warnings 含 SOURCE_REFRESH_FAILED → partial（部分源失败，其他源仍有数据）
 * - 有快照 + 其他 → fresh
 *
 * 优先级（从高到低，先命中先返回）：
 *   offline / loading > refresh-error > stale > partial > fresh
 *
 * ⚠️ STALE warning（codexSource.ts 单源级别）表示"该源数据已过期"，
 * 归类到 stale 而不是 partial —— 因为 partial 表示"某源失败但其他源正常"，
 * STALE 表示"数据本身还在但已过期"，语义不同。
 *
 * staleAfter 是 ISO 时间戳。renderer 本地用 now 判断，不每秒访问 bridge。
 */

import type { MultiClientSnapshot } from "../../../server/types.js";
import type { DataState } from "./types.js";

export type DataStateInput = {
  snapshot: MultiClientSnapshot | null;
  error: unknown;
  /** 注入当前时间，便于测试；默认 new Date()。 */
  now?: () => Date;
};

/**
 * warnings 中代表"某 source 刷新彻底失败（其他 source 可能正常）"的 code。
 * 来源：usageService.ts（聚合层失败）。
 * 触发 partial：数据部分可用，但有源失败。
 */
const SOURCE_REFRESH_FAILED_CODES = new Set(["SOURCE_REFRESH_FAILED"]);

/**
 * warnings 中代表"源数据已过期但仍保留"的 code。
 * 来源：codexSource.ts withStaleState。
 * 触发 stale：和 staleAfter 过期同义。
 */
const STALE_WARNING_CODES = new Set(["STALE"]);

/** warnings 中代表"bridge/源彻底不可用"的 code。 */
const OFFLINE_CODES = new Set(["BRIDGE_UNAVAILABLE", "USAGE_UNAVAILABLE"]);

export function classifyDataState(input: DataStateInput): {
  state: DataState;
  hasPartialWarning: boolean;
} {
  const { snapshot, error } = input;
  const now = (input.now ?? (() => new Date()))();

  // 1. 无快照：区分 offline vs loading
  if (snapshot === null) {
    if (error !== null && error !== undefined) {
      return { state: "offline", hasPartialWarning: false };
    }
    return { state: "loading", hasPartialWarning: false };
  }

  // 2. 有快照但刷新出错：保留上次有效数据
  if (error !== null && error !== undefined) {
    return { state: "refresh-error", hasPartialWarning: false };
  }

  // 检查 warnings（全局 + 各客户端）
  const warningCodes = new Set(
    [...snapshot.warnings, ...Object.values(snapshot.clients).flatMap((c) => c.warnings)].map(
      (w) => w.code,
    ),
  );

  // 3. stale 判定优先于 partial：数据仍在但已过期，无论过期来源是时间还是 STALE warning
  const staleAfter = snapshot.staleAfter;
  const isStaleByTime =
    staleAfter !== null && staleAfter !== "" && now.getTime() > new Date(staleAfter).getTime();
  const isStaleByWarning = [...warningCodes].some((code) => STALE_WARNING_CODES.has(code));
  if (isStaleByTime || isStaleByWarning) {
    return { state: "stale", hasPartialWarning: false };
  }

  // 4. 部分 source 失败：仍有数据，但有失败 warning（其他源可能正常）
  const hasPartial = [...warningCodes].some((code) => SOURCE_REFRESH_FAILED_CODES.has(code));
  if (hasPartial) {
    return { state: "partial", hasPartialWarning: true };
  }

  // 5. bridge/源彻底不可用（理论上 snapshot 为 null 时才命中，防御性兜底）
  if ([...warningCodes].some((code) => OFFLINE_CODES.has(code))) {
    return { state: "offline", hasPartialWarning: false };
  }

  // 6. 一切正常
  return { state: "fresh", hasPartialWarning: false };
}
