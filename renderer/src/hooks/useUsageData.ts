import { useEffect } from "react";
import useSWR from "swr";
import type { MultiClientSnapshot } from "../../../shared/desktop";
import { useUsageStore } from "../stores/usageStore";

const VISIBLE_POLL_INTERVAL_MS = 60_000;
const HIDDEN_POLL_INTERVAL_MS = 300_000;

export function useUsageData() {
  const setSnapshot = useUsageStore((state) => state.setSnapshot);
  const setError = useUsageStore((state) => state.setError);

  const result = useSWR<MultiClientSnapshot>("usage-snapshot", () => window.monitor.getUsage(), {
    refreshInterval: () =>
      document.visibilityState === "visible" ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS,
    refreshWhenHidden: true,
    revalidateOnFocus: false,
    dedupingInterval: 5_000,
    errorRetryCount: 3,
    errorRetryInterval: 5_000,
    keepPreviousData: true,
  });

  // Milestone E-F 验收修复（问题 3）：监听主进程推送的新快照（托盘刷新等触发），
  // 收到后立即 mutate 本地 SWR，不等下一轮轮询。
  // 依赖只取 result.mutate（SWR 保证稳定引用），不依赖整个 result 对象，
  // 避免每次 render 都重新订阅/取消订阅。
  const mutate = result.mutate;
  useEffect(() => {
    const unsubscribe = window.monitor.onUsageChanged((snapshot) => {
      void mutate(snapshot, { revalidate: false });
    });
    return unsubscribe;
  }, [mutate]);

  useEffect(() => {
    if (result.data) setSnapshot(result.data);
  }, [result.data, setSnapshot]);

  useEffect(() => {
    setError(
      result.error instanceof Error
        ? result.error.message
        : result.error
          ? String(result.error)
          : null,
    );
  }, [result.error, setError]);

  const refresh = async (): Promise<MultiClientSnapshot | null> => {
    try {
      const snapshot = await window.monitor.refreshUsage();
      await result.mutate(snapshot, { revalidate: false });
      return snapshot;
    } catch (err) {
      // 刷新失败：直接把错误推入 store（dataState → refresh-error）。
      // 不调 mutate（不触发重新校验），靠 SWR keepPreviousData 保留上次有效快照。
      // 注意：不能用 mutate(() => { throw })，因为 mutate 本身会 reject 传播错误。
      const message = err instanceof Error ? err.message : err ? String(err) : "refresh failed";
      setError(message);
      return null;
    }
  };

  return {
    snapshot: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isValidating: result.isValidating,
    refresh,
  };
}
