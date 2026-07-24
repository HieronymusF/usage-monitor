/**
 * OrbHoverController 测试 — 用户确认后的四态交互：
 * peek（半隐藏）→ hover revealed（完整贴边）→ drag floating / click expanded（Capsule）。
 * click 由 renderer useOrbDrag 负责；本控制器负责 hover 露出与窗口外收起。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { OrbHoverController, type OrbScheduler } from "../../electron/windows/orb-hover-controller";

type Surface = "orb" | "edge-capsule" | "card" | "indicator-bar" | undefined;
type PointerSample = { over: boolean; primaryButtonPressed: boolean };

function makeFakeManager() {
  const showOnlyCalls: string[] = [];
  let revealCalls = 0;
  let concealCalls = 0;
  let visibleSurface: Surface = "orb";
  let orbAtEdge = true;
  let showOnlyError: Error | null = null;
  return {
    showOnlyCalls,
    get revealCalls() {
      return revealCalls;
    },
    get concealCalls() {
      return concealCalls;
    },
    setVisibleSurface(surface: Surface) {
      visibleSurface = surface;
    },
    setOrbAtEdge(value: boolean) {
      orbAtEdge = value;
    },
    isOrbWindowAtEdge() {
      return orbAtEdge;
    },
    setShowOnlyError(error: Error | null) {
      showOnlyError = error;
    },
    getVisibleSurface() {
      return visibleSurface;
    },
    getVisibleWindow() {
      return { isDestroyed: () => false } as unknown;
    },
    revealOrbWindow() {
      revealCalls += 1;
    },
    concealOrbWindow() {
      concealCalls += 1;
    },
    async showOnly(kind: string) {
      showOnlyCalls.push(kind);
      if (showOnlyError) throw showOnlyError;
      visibleSurface = kind as Surface;
      return { applied: true };
    },
  };
}

function makeFakeProbe(sequence: PointerSample[]) {
  let index = 0;
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    readPointerState: async () => {
      calls += 1;
      const sample = sequence[index] ?? { over: false, primaryButtonPressed: false };
      index += 1;
      return sample;
    },
  };
}

class ManualScheduler implements OrbScheduler {
  handler: (() => void) | null = null;
  setInterval(handler: () => void): unknown {
    this.handler = handler;
    return {};
  }
  clearInterval(): void {
    this.handler = null;
  }
  async tick(): Promise<void> {
    this.handler?.();
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("peek: hover 命中立即露出完整 Orb，不展开 Capsule", async () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([{ over: true, primaryButtonPressed: false }]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();

  await scheduler.tick();

  assert.equal(controller.state, "revealed");
  assert.equal(manager.revealCalls, 1, "hover 只移动 Orb 到完整贴边位置");
  assert.deepEqual(manager.showOnlyCalls, [], "hover 不得展开 EdgeCapsule");
  controller.stop();
});

test("revealed: 鼠标离开满 1 秒后自动退回半隐藏", async () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([
    { over: true, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: false },
  ]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const controller = new OrbHoverController(manager as never, probe as never, {
    scheduler,
    now: () => clock,
    collapseDelayMs: 1000,
  });
  controller.start();
  await scheduler.tick(); // hover → revealed
  clock = 100;
  await scheduler.tick(); // leave starts
  clock = 1099;
  await scheduler.tick();
  assert.equal(manager.concealCalls, 0, "离开 999ms 不收起");
  clock = 1100;
  await scheduler.tick();
  assert.equal(manager.concealCalls, 1, "离开完整 Orb 满 1 秒后重新半隐藏");
  assert.equal(controller.state, "peek");
  controller.stop();
});

test("revealed: 窗口外左键点击立即退回半隐藏", async () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([
    { over: true, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: true },
  ]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(manager.concealCalls, 1);
  assert.equal(controller.state, "peek");
  controller.stop();
});

test("expanded: 窗口外左键点击立即切回半隐藏 Orb", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("edge-capsule");
  const probe = makeFakeProbe([{ over: false, primaryButtonPressed: true }]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();
  await scheduler.tick();
  assert.deepEqual(manager.showOnlyCalls, ["orb"]);
  assert.equal(controller.state, "peek");
  controller.stop();
});

test("expanded: 鼠标离开整个 Capsule 1 秒后切回 Orb", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("edge-capsule");
  const probe = makeFakeProbe([
    { over: false, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: false },
  ]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const controller = new OrbHoverController(manager as never, probe as never, {
    scheduler,
    now: () => clock,
    collapseDelayMs: 1000,
  });
  controller.start();
  await scheduler.tick();
  clock = 999;
  await scheduler.tick();
  assert.deepEqual(manager.showOnlyCalls, []);
  clock = 1000;
  await scheduler.tick();
  assert.deepEqual(manager.showOnlyCalls, ["orb"]);
  controller.stop();
});

test("expanded: 从自由位置展开时，离开 1 秒恢复 floating Orb 而不是贴边", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("edge-capsule");
  manager.setOrbAtEdge(false);
  const probe = makeFakeProbe([
    { over: false, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: false },
  ]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const controller = new OrbHoverController(manager as never, probe as never, {
    scheduler,
    now: () => clock,
    collapseDelayMs: 1000,
  });
  controller.start();
  await scheduler.tick();
  clock = 1000;
  await scheduler.tick();
  assert.deepEqual(manager.showOnlyCalls, ["orb"]);
  assert.equal(controller.state, "floating");
  controller.stop();
});

test("expanded: 光标仍在 Capsule 内时不收起，内部点击也不算空白点击", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("edge-capsule");
  const probe = makeFakeProbe([
    { over: true, primaryButtonPressed: false },
    { over: true, primaryButtonPressed: true },
  ]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();
  await scheduler.tick();
  await scheduler.tick();
  assert.deepEqual(manager.showOnlyCalls, []);
  assert.equal(controller.state, "expanded");
  controller.stop();
});

test("drag: suspend 保持完整 Orb，拖动结束进入可停任意位置的 floating", async () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([
    { over: true, primaryButtonPressed: false },
    { over: true, primaryButtonPressed: false },
  ]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();
  await scheduler.tick();
  controller.suspend();
  await scheduler.tick();
  assert.equal(controller.state, "revealed");
  assert.equal(manager.concealCalls, 0, "开始拖动不能把 Orb 再藏回去");
  assert.deepEqual(manager.showOnlyCalls, []);
  manager.setOrbAtEdge(false);
  (controller.resume as unknown as (dragged: boolean) => void)(true);
  assert.equal(controller.state, "floating", "drag-end 后悬浮球保持自由位置，不强制吸边");
  controller.stop();
});

test("drag: 拖到屏幕边缘后进入 revealed，移开 1 秒自动半隐藏", async () => {
  const manager = makeFakeManager();
  manager.setOrbAtEdge(false);
  const probe = makeFakeProbe([
    { over: false, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: false },
  ]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const controller = new OrbHoverController(manager as never, probe as never, {
    scheduler,
    now: () => clock,
    collapseDelayMs: 1000,
  });
  controller.start();
  assert.equal(controller.state, "floating");

  controller.suspend();
  manager.setOrbAtEdge(true);
  controller.resume(true);
  assert.equal(controller.state, "revealed", "边缘拖放后完整 Orb 是等待自动回藏的临时态");

  await scheduler.tick();
  clock = 1000;
  await scheduler.tick();
  assert.equal(manager.concealCalls, 1);
  assert.equal(controller.state, "peek");
  controller.stop();
});

test("floating: 离开或点击窗口外都不隐藏自由悬浮球", async () => {
  const manager = makeFakeManager();
  manager.setOrbAtEdge(false);
  const probe = makeFakeProbe([
    { over: false, primaryButtonPressed: false },
    { over: false, primaryButtonPressed: true },
  ]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();
  controller.onSurfaceChanged("orb");
  assert.equal(controller.state, "floating");
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(manager.concealCalls, 0);
  assert.equal(controller.state, "floating");
  controller.stop();
});

test("card/bar 可见时静默，不调用鼠标探针", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("card");
  const probe = makeFakeProbe([{ over: true, primaryButtonPressed: false }]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();
  await scheduler.tick();
  assert.equal(probe.calls, 0);
  assert.equal(manager.revealCalls, 0);
  controller.stop();
});

test("onSurfaceChanged: Orb 按当前位置区分边缘收回态与自由悬浮态", () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([]);
  const controller = new OrbHoverController(manager as never, probe as never);
  controller.onSurfaceChanged("edge-capsule");
  assert.equal(controller.state, "expanded");
  manager.setOrbAtEdge(false);
  controller.onSurfaceChanged("orb");
  assert.equal(controller.state, "floating");
  manager.setOrbAtEdge(true);
  controller.onSurfaceChanged("orb");
  assert.equal(controller.state, "peek");
});

test("expanded: showOnly(orb) 失败时保持 expanded 以便下轮重试", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("edge-capsule");
  manager.setShowOnlyError(new Error("boom"));
  const probe = makeFakeProbe([{ over: false, primaryButtonPressed: true }]);
  const scheduler = new ManualScheduler();
  const controller = new OrbHoverController(manager as never, probe as never, { scheduler });
  controller.start();
  await scheduler.tick();
  assert.equal(controller.state, "expanded");
  controller.stop();
});
