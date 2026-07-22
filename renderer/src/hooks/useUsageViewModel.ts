/**
 * useUsageViewModel — 把 useUsageData + usageStore.activeClient + error 组合成 UsageViewModel。
 *
 * 倒计时本地每秒/每分钟更新(不影响 SWR 轮询),通过内部 state 触发 re-render。
 *
 * 预览模式(开发/视觉验证): URL 加 ?preview=dual|weekly-only|five-only|no-quota|zcode-local|zcode-no-data
 * 注入对应 fixture,绕过 bridge。
 *
 * v27 FIXED_NOW：预览模式用 fixture 的 BASE_TIME 作为 now，让 todayKey 命中 fixture 的 daily bucket
 * （fixture bucket key 是 BASE_TIME 的日期）。生产模式 now 跟随系统实时，不变。
 *
 * v27 refresh 透传：返回值含 refresh（从内部 useUsageData 透传），让调用方（如 EdgeCapsule）
 * 不必再单独调 useUsageData（避免同一 SWR key 重复订阅）。
 *
 * zcode-* 预览下 activeClient 仍是默认 "codex"（dev 启动时无代码自动切换它），
 * 靠 pickClientSnapshot 的 fallback 链（active 不在 snapshot 时 → codex → zcode → 第一个可用）
 * 才拿到 zcode 数据。生产环境用户从 CardHeader 菜单切到 ZCode 时走 setActiveClient 正常路径。
 * 生产环境不走预览路径。
 */

import { useEffect, useState } from "react";
import { toUsageViewModel } from "../domain/usage-view-model";
import type { MultiClientSnapshot, UsageViewModel } from "../domain/types";
import {
  BASE_TIME,
  codexDual,
  codexFiveOnly,
  codexNoQuota,
  codexWeeklyOnly,
  zcodeLocalData,
  zcodeNoData,
} from "../domain/fixtures/snapshots";
import { useUsageData } from "./useUsageData";
import { useUsageStore } from "../stores/usageStore";

const COUNTDOWN_TICK_MS = 1000;

const PREVIEW_FIXTURES: Record<string, MultiClientSnapshot> = {
  dual: codexDual,
  "weekly-only": codexWeeklyOnly,
  "five-only": codexFiveOnly,
  "no-quota": codexNoQuota,
  "zcode-local": zcodeLocalData,
  "zcode-no-data": zcodeNoData,
};

/** 预览模式的固定时钟：让 todayKey 命中 fixture 的 daily bucket（BASE_TIME 的日期）。 */
const PREVIEW_NOW = (): Date => new Date(BASE_TIME);

function readPreview(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("preview");
}

/** useUsageViewModel 的返回值：UsageViewModel + refresh（v27 透传，避免重复订阅 SWR）。 */
export type UsageViewModelWithRefresh = UsageViewModel & {
  refresh: () => Promise<MultiClientSnapshot | null>;
};

export function useUsageViewModel(): UsageViewModelWithRefresh {
  const usage = useUsageData();
  const activeClient = useUsageStore((state) => state.activeClient);
  // v28：error 从 store 读（单一真相）。useUsageData 把 SWR error 推到 store；
  // refresh 失败时也直接 setError 推到 store。vm 读 store.error 才能进 refresh-error。
  const error = useUsageStore((state) => state.error);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const preview = readPreview();
  if (preview !== null && preview in PREVIEW_FIXTURES) {
    // 预览模式:用 fixture,不报错,dataState=fresh。
    // v27：now 用 BASE_TIME 让 todayKey 命中 fixture daily bucket（否则实时日期 != fixture 日期 → 今日 token 显示 —）
    const vm = toUsageViewModel({
      snapshot: PREVIEW_FIXTURES[preview]!,
      error: null,
      activeClientId: activeClient,
      now: PREVIEW_NOW,
    });
    return { ...vm, refresh: usage.refresh };
  }

  const vm = toUsageViewModel({
    snapshot: usage.snapshot ?? null,
    error,
    activeClientId: activeClient,
    // 生产模式 now 跟随系统实时（ticker 每秒更新，倒计时/状态判定用）
    now: () => now,
  });
  return { ...vm, refresh: usage.refresh };
}
