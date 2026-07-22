/**
 * useCardWindowResize — 监听 client.kind 变化，通知主进程 resize Card 窗口。
 *
 * 数据流：CardHeader setActiveClient → usageStore → useUsageViewModel → vm.client.kind
 *   → 本 hook useEffect → window.monitor.resizeCardWindow(kind)
 *   → ipcRenderer.send → ipcMain.on → windowManager.resizeCardWindow → BrowserWindow.setSize
 *
 * preview 模式（CARD_PREVIEW）下 window.monitor 可能未注入（dev server 走 fixture），
 * 这种情况下不报错，静默跳过——preview 用 dev server 加载，preload 仍工作，但 fixture
 * 不切换 client，所以不会触发本 hook 的 effect。
 *
 * 不做"kind 没变就不 resize"的优化——BrowserWindow.setSize 自身幂等，重复调无副作用。
 */

import { useEffect } from "react";
import type { CardClientKind } from "../../../shared/desktop";

/**
 * @param kind 当前 vm.client?.kind；null/loading 时不 resize（保持上次窗口尺寸）
 */
export function useCardWindowResize(kind: CardClientKind | null | undefined): void {
  useEffect(() => {
    if (!kind) return;
    if (typeof window === "undefined" || !window.monitor?.resizeCardWindow) return;
    window.monitor.resizeCardWindow(kind);
  }, [kind]);
}
