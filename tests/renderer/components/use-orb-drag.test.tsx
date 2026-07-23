/**
 * useOrbDrag 测试 — D-3 切片 3 拖动 hook（pointer 状态机 + 竞态修复）。
 *
 * 覆盖场景（PRD §6.5 + 修复要求）：
 * - 正常 click（位移 < 6 DIP）→ showSurface("edge-capsule")，不 moveOrb/dragOrbEnd
 * - 拖动 > 6 DIP → moveOrb 被调用 + dragOrbEnd（贴边）
 * - bounds 未就绪前不 moveOrb（竞态：getOrbBounds 异步未返回时 move 不应发生）
 * - pointercancel → 不展开、不贴边（中断）
 * - 快速移动：bounds 慢返回时窗口不跳向原点
 *
 * 用 fake window.monitor（记录调用）+ fake pointer events。rAF 用 requestAnimationFrame 真实
 * （jsdom 提供），但为确定性，pending 坐标在 pointerup 时 flush。
 */
import "./jsdom-setup";
import React from "react";
import { afterEach } from "node:test";
import { cleanup, render } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";
import { useOrbDrag } from "../../../renderer/src/hooks/useOrbDrag";

afterEach(cleanup);

interface MonitorCalls {
  moveOrb: Array<{ x: number; y: number }>;
  dragOrbEnd: number;
  showSurface: string[];
  suspendHover: number;
  resumeHover: number;
  getOrbBoundsResolve:
    ((b: { x: number; y: number; width: number; height: number } | null) => void) | null;
}

function installMockMonitor(): MonitorCalls {
  const calls: MonitorCalls = {
    moveOrb: [],
    dragOrbEnd: 0,
    showSurface: [],
    suspendHover: 0,
    resumeHover: 0,
    getOrbBoundsResolve: null,
  };
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    moveOrb: (x: number, y: number) => {
      calls.moveOrb.push({ x, y });
    },
    dragOrbEnd: () => {
      calls.dragOrbEnd += 1;
    },
    showSurface: (kind: string) => {
      calls.showSurface.push(kind);
    },
    suspendHover: () => {
      calls.suspendHover += 1;
    },
    resumeHover: () => {
      calls.resumeHover += 1;
    },
    // getOrbBounds 不立即 resolve——存 resolver，测试控制何时返回（模拟异步）。
    getOrbBounds: () =>
      new Promise((resolve) => {
        calls.getOrbBoundsResolve = (b) => resolve(b);
      }),
  };
  return calls;
}

function clearMockMonitor(): void {
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = undefined;
}

/** 构造 pointer event init。currentTarget 由调用方传入（来自 ref）。 */
function pointerInit(
  target: HTMLElement,
  screenX: number,
  screenY: number,
  button = 0,
): React.PointerEvent {
  return {
    screenX,
    screenY,
    button,
    pointerId: 1,
    currentTarget: target,
    preventDefault: () => undefined,
  } as unknown as React.PointerEvent;
}

/** 直接调 hook 暴露的 handler（通过 host 的 ref 取 handler + target）。 */
function DragHostWithRef({
  onHandlers,
}: {
  onHandlers: (h: ReturnType<typeof useOrbDrag>, target: HTMLElement) => void;
}): React.ReactElement {
  const drag = useOrbDrag();
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (ref.current) onHandlers(drag, ref.current);
  });
  return (
    <div
      ref={ref}
      data-testid="drag-target"
      style={{ width: 82, height: 136 }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
    />
  );
}

test("useOrbDrag: 正常 click → showSurface edge-capsule", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  // pointerdown at (500,500), bounds 异步返回 (100,200)
  handlers.onPointerDown(pointerInit(target, 500, 500));
  // bounds 立即 resolve
  assert.ok(calls.getOrbBoundsResolve, "getOrbBounds 被调");
  calls.getOrbBoundsResolve({ x: 100, y: 200, width: 82, height: 136 });

  // 小幅移动（< 6 DIP）+ up → click
  handlers.onPointerMove(pointerInit(target, 503, 503));
  handlers.onPointerUp(pointerInit(target, 503, 503));
  // flush 微任务
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.showSurface.length, 1, "click 展开");
  assert.equal(calls.showSurface[0], "edge-capsule");
  assert.equal(calls.moveOrb.length, 0, "click 不移动");
  assert.equal(calls.dragOrbEnd, 0, "click 不贴边");
  clearMockMonitor();
});

test("useOrbDrag: 拖动 > 6 DIP → moveOrb + dragOrbEnd", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  calls.getOrbBoundsResolve?.({ x: 100, y: 200, width: 82, height: 136 });
  // 等 getOrbBounds 的 .then 微任务跑完（设置 startBounds），否则 pointermove 时 bounds 仍 null。
  await new Promise((r) => setTimeout(r, 0));

  // 大幅移动（> 6 DIP）
  handlers.onPointerMove(pointerInit(target, 550, 530)); // dx=50, dy=30
  // flush rAF（moveOrb 在 rAF 回调里）
  await new Promise((r) => setTimeout(r, 30));
  handlers.onPointerUp(pointerInit(target, 550, 530));
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(calls.moveOrb.length > 0, "拖动调 moveOrb");
  // moveOrb 目标 = startBounds(100,200) + dx(50,30) = (150,230)
  const last = calls.moveOrb[calls.moveOrb.length - 1];
  assert.ok(last, "有 moveOrb 记录");
  assert.equal(last!.x, 150, "moveOrb x = bounds.x + dx");
  assert.equal(last!.y, 230, "moveOrb y = bounds.y + dy");
  assert.equal(calls.dragOrbEnd, 1, "松手贴边");
  assert.equal(calls.showSurface.length, 0, "拖动不展开");
  clearMockMonitor();
});

test("useOrbDrag: bounds 未就绪前不 moveOrb（竞态保护）", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  // 不 resolve getOrbBounds —— bounds 未就绪
  // 大幅移动（> 6 DIP）
  handlers.onPointerMove(pointerInit(target, 550, 530));
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(calls.moveOrb.length, 0, "bounds 未就绪绝不 moveOrb（不跳原点）");
  clearMockMonitor();
});

test("useOrbDrag: pointercancel → 中断，不展开不贴边", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  calls.getOrbBoundsResolve?.({ x: 100, y: 200, width: 82, height: 136 });
  handlers.onPointerMove(pointerInit(target, 550, 530)); // 进入拖动
  await new Promise((r) => setTimeout(r, 20));
  handlers.onPointerCancel(pointerInit(target, 550, 530)); // 取消
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.dragOrbEnd, 0, "cancel 不贴边");
  assert.equal(calls.showSurface.length, 0, "cancel 不展开");
  clearMockMonitor();
});

test("useOrbDrag: getOrbBounds 返回 null（无可见窗口）→ 不展开不移动", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  calls.getOrbBoundsResolve?.(null); // bounds = null
  handlers.onPointerMove(pointerInit(target, 550, 530)); // > 6 DIP
  await new Promise((r) => setTimeout(r, 20));
  handlers.onPointerUp(pointerInit(target, 550, 530));
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.moveOrb.length, 0, "bounds=null 不移动");
  assert.equal(calls.showSurface.length, 0, "bounds=null 拖动不展开（wasDragging 但无 snap 触发）");
  assert.equal(
    calls.dragOrbEnd,
    1,
    "bounds=null 但已超阈值→仍 dragOrbEnd（dragging 标记独立于 bounds）",
  );
  clearMockMonitor();
});

test("P1-1: pointerdown 立即 suspendHover，pointerup resumeHover", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  assert.equal(calls.suspendHover, 1, "pointerdown 立即 suspendHover（暂停 hover 防误触）");
  calls.getOrbBoundsResolve?.({ x: 100, y: 200, width: 82, height: 136 });
  await new Promise((r) => setTimeout(r, 0));
  handlers.onPointerMove(pointerInit(target, 503, 503)); // < 6 DIP
  await new Promise((r) => setTimeout(r, 20));
  handlers.onPointerUp(pointerInit(target, 503, 503)); // click
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.resumeHover, 1, "pointerup resumeHover");
  clearMockMonitor();
});

test("P1-2: down→up 超过 6 DIP 无 pointermove 仍判定为拖动（不展开）", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  calls.getOrbBoundsResolve?.({ x: 100, y: 200, width: 82, height: 136 });
  await new Promise((r) => setTimeout(r, 0));
  // 不发 pointermove，直接 pointerup 到远处（dx=50>6）
  handlers.onPointerUp(pointerInit(target, 550, 500));
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.showSurface.length, 0, "位移超阈值判为拖动，不展开");
  assert.equal(calls.dragOrbEnd, 1, "判为拖动→贴边");
  // P2：判为拖动且 bounds 可用时，pointerup 先发最终坐标给 moveOrb（100+50=150, 200+0=200）
  assert.ok(calls.moveOrb.length > 0, "pointerup 发最终坐标 moveOrb");
  const lastMove = calls.moveOrb[calls.moveOrb.length - 1];
  assert.equal(lastMove!.x, 150, "最终 moveOrb x = bounds.x + upDx");
  assert.equal(lastMove!.y, 200, "最终 moveOrb y = bounds.y + upDy");
  clearMockMonitor();
});

test("P2: pointerup 最终坐标在 dragOrbEnd 之前发送（最后一次 move 到 up 仍有位移）", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  calls.getOrbBoundsResolve?.({ x: 100, y: 200, width: 82, height: 136 });
  await new Promise((r) => setTimeout(r, 0));
  // 先 move 一段（进入拖动，触发 moveOrb），再 up 到更远处（最终坐标不同）
  handlers.onPointerMove(pointerInit(target, 530, 510));
  await new Promise((r) => setTimeout(r, 30));
  const moveCountBeforeUp = calls.moveOrb.length;
  handlers.onPointerUp(pointerInit(target, 570, 520)); // 最终 dx=70, dy=20
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(calls.moveOrb.length > moveCountBeforeUp, "pointerup 又发了一次 moveOrb（最终坐标）");
  const lastMove = calls.moveOrb[calls.moveOrb.length - 1];
  assert.equal(lastMove!.x, 170, "最终 moveOrb x = 100 + 70");
  assert.equal(lastMove!.y, 220, "最终 moveOrb y = 200 + 20");
  assert.equal(calls.dragOrbEnd, 1, "贴边在最终坐标之后");
  clearMockMonitor();
});

test("P1-2: down→up 位移 < 6 DIP 无 pointermove 仍判为 click（展开）", async () => {
  const calls = installMockMonitor();
  const ref = {
    handlers: null as ReturnType<typeof useOrbDrag> | null,
    target: null as HTMLElement | null,
  };
  render(
    <DragHostWithRef
      onHandlers={(h, t) => {
        ref.handlers = h;
        ref.target = t;
      }}
    />,
  );
  assert.ok(ref.handlers && ref.target);
  const handlers = ref.handlers;
  const target = ref.target;
  target.setPointerCapture = () => undefined;
  target.releasePointerCapture = () => undefined;

  handlers.onPointerDown(pointerInit(target, 500, 500));
  calls.getOrbBoundsResolve?.({ x: 100, y: 200, width: 82, height: 136 });
  await new Promise((r) => setTimeout(r, 0));
  handlers.onPointerUp(pointerInit(target, 503, 500)); // dx=3 < 6
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.showSurface.length, 1, "位移不足判为 click→展开");
  assert.equal(calls.dragOrbEnd, 0, "判为 click→不贴边");
  clearMockMonitor();
});
