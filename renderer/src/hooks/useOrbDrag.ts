/**
 * useOrbDrag — Orb 拖动 + click 展开 + 松手位置交给主进程判定边缘/自由。
 *
 * 返回一组 pointer handler props，spread 到 OrbShell（OrbShell 已设 WebkitAppRegion:"no-drag"，
 * 由本 hook 接管拖动，不依赖 OS drag region —— 因为 OS drag 抑制 renderer 指针事件，
 * 无法做 6 DIP 阈值或 click/drag 区分）。
 *
 * 状态机：
 *   pointerdown → 发 getOrbBounds() 拿窗口绝对位置（异步）+ 记 screenX/Y + setPointerCapture
 *   pointermove → 算总位移；shouldStartDrag 超 6 DIP 才 moveOrb（rAF 16ms 节流）。
 *                 bounds 未就绪前**绝不**移动窗口（否则跳向屏幕原点）。
 *   pointerup   → 未超阈值 = click → showSurface("edge-capsule")；
 *                 超阈值 = drag → dragOrbEnd()（碰边吸附，否则保存自由位置）
 *   pointercancel / lostpointercapture → 中断（不保存、不展开、清状态）
 *
 * 单位：renderer event.screenX 是 CSS 像素 = DIP（Electron renderer 标准），与
 * setPosition 的 DIP 单位一致，startBounds.x + totalDx 直接相加。
 *
 * preview 模式（window.monitor 未注入）静默跳过，仿 useCardWindowResize guard。
 *
 * 竞态修复（2026-07-23）：
 * - startBounds 初始 null，bounds 未就绪前不调 moveOrb（旧版用 {x:0,y:0} 占位，快速移动时
 *   基于零坐标调 moveOrb → 窗口跳向屏幕原点）。
 * - 异步 getOrbBounds 结果用 dragId token 防过期：若期间发生了新的 pointerdown/cancel，
 *   旧结果丢弃。
 * - pointercancel / lostpointercapture 显式处理（中断拖动，不触发 click/snap）。
 * - 组件卸载时 useEffect 清理 stateRef + 取消 rAF。
 */
import { useCallback, useEffect, useRef } from "react";
import { shouldStartDrag } from "../../../shared/orb-drag";

const DRAG_THRESHOLD_DIP = 6;
/** moveOrb rAF 节流：避免每个 pointermove 都 IPC（~16ms = 60fps 上限）。 */
const MOVE_THROTTLE_MS = 16;

export interface OrbDragHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  /** 中断：取消/丢失捕获。不保存、不展开。 */
  onPointerCancel: (event: React.PointerEvent) => void;
  /** 丢失 pointer capture（系统剥夺）→ 当作取消。 */
  onLostPointerCapture: (event: React.PointerEvent) => void;
}

interface DragState {
  /** pointerdown 时的窗口绝对 bounds（DIP）。null = getOrbBounds 未返回，禁止移动。 */
  startBounds: { x: number; y: number } | null;
  /** pointerdown 时的 screenX/Y（DIP）。 */
  startScreenX: number;
  startScreenY: number;
  /** 是否已进入实际拖动（超阈值）。 */
  dragging: boolean;
  /** pointerCapture 的 element + pointerId，用于 release。 */
  capturedElement: Element | null;
  capturedPointerId: number | null;
  /** rAF 节流：上次 moveOrb 时间戳。 */
  lastMoveTime: number;
  /** 待发送的最新目标坐标（rAF 批处理）。 */
  pendingX: number;
  pendingY: number;
  /** rAF handle。 */
  rafId: number | null;
  /** 本轮 drag 的唯一 id，用于防异步结果过期。 */
  dragId: number;
}

export function useOrbDrag(): OrbDragHandlers {
  const stateRef = useRef<DragState | null>(null);
  /** 单调递增的 drag id，每次 pointerdown +1，用于丢弃过期的 getOrbBounds 结果。 */
  const dragIdRef = useRef(0);

  const flushMove = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    state.rafId = null;
    // bounds 未就绪时禁止移动（竞态保护：绝不基于 null/占位坐标调 moveOrb）。
    if (state.startBounds === null) return;
    state.lastMoveTime = performance.now();
    window.monitor?.moveOrb?.(state.pendingX, state.pendingY);
  }, []);

  // 组件卸载清理：取消 rAF + 置空 state，防卸载后回调写 state。
  useEffect(() => {
    return () => {
      const state = stateRef.current;
      if (state && state.rafId !== null) {
        window.cancelAnimationFrame(state.rafId);
      }
      stateRef.current = null;
    };
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (typeof window === "undefined" || !window.monitor?.moveOrb) return;
    // 左键（button=0）才处理拖动/click；右键/中键忽略。
    if (event.button !== 0) return;
    event.preventDefault();

    // P1-1：pointerdown 立即暂停 hover（清 dwell + 标记需离开才恢复），防拖动期间误触展开。
    window.monitor.suspendHover?.();

    // 新一轮 drag：递增 id，丢弃之前所有未完成的 getOrbBounds 结果。
    const dragId = ++dragIdRef.current;

    // 异步拿 bounds（IPC invoke）。未返回前 startBounds 保持 null，pointermove 不会移动窗口。
    // P2：捕获 rejection（IPC 错误），不产生 unhandled rejection。
    // 失败时保持 startBounds=null，本轮无法拖动；pointerup 会判 click（未超阈值）或无操作，
    // 并 resumeHover 恢复 hover 能力——交互安全结束。
    const promise = window.monitor.getOrbBounds();
    void promise
      .then((bounds) => {
        // 过期检查：若期间发生了新的 pointerdown 或 cancel，dragId 已变，丢弃本结果。
        const state = stateRef.current;
        if (!state || state.dragId !== dragId) return;
        if (bounds) {
          state.startBounds = { x: bounds.x, y: bounds.y };
        }
        // bounds 为 null：保持 null，本轮无法拖动（保守：不猜位置）。
      })
      .catch(() => {
        // getOrbBounds 失败（IPC 错误/Orb 不可用）：静默，startBounds 保持 null。
        // 本轮交互会按 click 处理或无操作，pointerup 时 resumeHover 恢复 hover。
      });

    stateRef.current = {
      startBounds: null,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      dragging: false,
      capturedElement: event.currentTarget,
      capturedPointerId: event.pointerId,
      lastMoveTime: 0,
      pendingX: 0,
      pendingY: 0,
      rafId: null,
      dragId,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture 可能因元素状态失败，非致命。
    }
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = stateRef.current;
      if (!state) return;
      const totalDx = event.screenX - state.startScreenX;
      const totalDy = event.screenY - state.startScreenY;

      if (!state.dragging) {
        if (!shouldStartDrag(totalDx, totalDy, DRAG_THRESHOLD_DIP)) return;
        state.dragging = true;
      }

      // bounds 未就绪：进入 dragging 标记但暂不计算目标坐标（flushMove 会跳过）。
      if (state.startBounds === null) return;

      // 节流：rAF 批处理（同一帧只发一次最新坐标）。
      state.pendingX = state.startBounds.x + totalDx;
      state.pendingY = state.startBounds.y + totalDy;
      const now = performance.now();
      if (state.rafId === null && now - state.lastMoveTime >= MOVE_THROTTLE_MS) {
        state.rafId = window.requestAnimationFrame(flushMove);
      }
    },
    [flushMove],
  );

  const finishDrag = useCallback((event: React.PointerEvent, canceled: boolean) => {
    const state = stateRef.current;
    if (!state) return;
    // 取消未 flush 的 rAF。
    if (state.rafId !== null) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    // P1-2：pointerup 重新用最终 screenX/Y 计算总位移判定是否拖动。
    // 不只读 state.dragging（最后一次 pointermove 可能被合并/遗漏）。
    const upDx = event.screenX - state.startScreenX;
    const upDy = event.screenY - state.startScreenY;
    const wasDragging = state.dragging || shouldStartDrag(upDx, upDy, DRAG_THRESHOLD_DIP);

    // 释放 pointer capture。
    if (state.capturedElement && state.capturedPointerId !== null) {
      try {
        state.capturedElement.releasePointerCapture(state.capturedPointerId);
      } catch {
        // 非致命。
      }
    }

    stateRef.current = null;

    // 取消（pointercancel / lostpointercapture）：不保存、不展开，恢复原 hover 状态。
    if (canceled) {
      window.monitor?.resumeHover?.(false);
      return;
    }

    if (typeof window === "undefined" || !window.monitor) return;
    if (wasDragging) {
      // 判为拖动且 bounds 可用时，先把最终目标坐标发给 moveOrb，再由主进程判定边缘/自由。
      // 覆盖无 pointermove 的快速 down→up，以及最后一次 move 到 up 仍有位移的情况。
      // 确保窗口先到松手位置，再由主进程 clamp 到 workArea 并落盘。
      if (state.startBounds !== null) {
        window.monitor.moveOrb?.(state.startBounds.x + upDx, state.startBounds.y + upDy);
      }
      window.monitor.dragOrbEnd?.();
      window.monitor.resumeHover?.(true);
    } else {
      window.monitor.resumeHover?.(false);
      // click 展开（未超阈值）：复用 showSurface。
      // P2-1：manager surface 变更监听通知 OrbHoverController state=expanded，
      // 这样点击后立即移开鼠标也能进入 Capsule 的 1 秒离开计时。
      window.monitor.showSurface?.("edge-capsule");
    }
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      finishDrag(event, false);
    },
    [finishDrag],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      finishDrag(event, true);
    },
    [finishDrag],
  );

  const onLostPointerCapture = useCallback(
    (event: React.PointerEvent) => {
      finishDrag(event, true);
    },
    [finishDrag],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture };
}
