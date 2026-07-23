/**
 * OrbHoverController 测试 — D-3 切片 2 的 hover 状态机（CI 安全，无真实 Electron）。
 *
 * OrbHoverController 从 manager/hover-probe 只做 `import type`（类型擦除），可在 node:test 下测。
 * 注入 fake windowManager（记录 showOnly 调用 + 可控 getVisibleSurface/getVisibleWindow）、
 * fake hoverProbe（可控 isPointerOver 返回值）、可控 now（确定性时间）+ fake scheduler
 * （手动驱动 setInterval 回调，不真等 80ms）。
 *
 * 覆盖场景：
 * - 连续命中 220ms → 展开（showOnly edge-capsule）
 * - 连续离开 420ms → 收起（showOnly orb）
 * - 短暂离开不展开 / 短暂命中不收起（延迟语义）
 * - card/bar 可见时静默（不 probe）
 * - showOnly 失败回滚状态
 * - 实测经过时间（probe 间隔不等于延迟时不漂移）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { OrbHoverController, type OrbScheduler } from "../../electron/windows/orb-hover-controller";

/** fake SurfaceWindowManager：只实现 controller 用到的方法。 */
function makeFakeManager() {
  const calls: string[] = [];
  let visibleSurface: "orb" | "edge-capsule" | "card" | "indicator-bar" | undefined = "orb";
  let showOnlyError: Error | null = null;
  return {
    calls,
    setVisibleSurface(s: typeof visibleSurface) {
      visibleSurface = s;
    },
    setShowOnlyError(e: Error | null) {
      showOnlyError = e;
    },
    getVisibleSurface() {
      return visibleSurface;
    },
    getVisibleWindow() {
      // 返回一个 truthy 占位（controller 只判 null/destroyed；probe 是 fake 不真用 window）。
      return { isDestroyed: () => false } as unknown;
    },
    async showOnly(kind: string) {
      calls.push(kind);
      if (showOnlyError) throw showOnlyError;
      // 展开后切到 edge-capsule，收起后切回 orb，模拟真实显隐。
      visibleSurface = kind as typeof visibleSurface;
    },
  };
}

/** fake HoverProbe：按序列返回 isPointerOver 结果。 */
function makeFakeProbe(sequence: boolean[]) {
  let i = 0;
  return {
    isPointerOver: async () => {
      const v = sequence[i] ?? false;
      i += 1;
      return v;
    },
  };
}

/** 手动驱动的 scheduler：记录回调，测试调 tick() 触发。 */
class ManualScheduler implements OrbScheduler {
  handler: (() => void) | null = null;
  setInterval(handler: () => void): unknown {
    this.handler = handler;
    return {};
  }
  clearInterval(): void {
    this.handler = null;
  }
  /**
   * 触发一次 probe 回调，并 await 到 probe 完成。
   * 控制器的 interval handler 用 `void this.#probeOnce()`（fire-and-forget），所以
   * handler() 同步返回；probe 是异步的，需手动 flush 微任务等它跑完（#probing 复位），
   * 否则下一次 tick 会被重入保护跳过。
   */
  async tick(): Promise<void> {
    if (!this.handler) return;
    this.handler();
    // flush 微任务直到一轮 probe 跑完（#probing 复位由 controller 内部 finally 完成）。
    // 给足够的微任务 + 短宏任务，覆盖 await isPointerOver。
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

test("hover: 连续命中 220ms → 展开 edge-capsule", async () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([true, true, true, true]); // 每次都命中
  const scheduler = new ManualScheduler();
  let clock = 1000;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
  });
  ctrl.start();

  await scheduler.tick(); // t=1000, dwell start=1000
  clock = 1100; // +100ms，未达 220
  await scheduler.tick();
  assert.equal(manager.calls.length, 0, "100ms 不足 220，不展开");
  clock = 1300; // +300ms 累计，达 220
  await scheduler.tick();
  assert.equal(manager.calls.length, 1, "达 220ms 展开");
  assert.equal(manager.calls[0], "edge-capsule", "展开到 edge-capsule");
  ctrl.stop();
});

test("hover: 短暂命中不足 220ms 不展开", async () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([true, false, false]); // 命中 1 次后离开
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
  });
  ctrl.start();
  clock = 100;
  await scheduler.tick(); // 命中，dwell=100
  clock = 200;
  await scheduler.tick(); // 离开，dwell 重置
  clock = 500;
  await scheduler.tick(); // 仍离开
  assert.equal(manager.calls.length, 0, "短暂命中后离开，不展开");
  ctrl.stop();
});

test("hover: 连续离开 420ms → 收回 orb", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("edge-capsule"); // 已展开
  const probe = makeFakeProbe([false, false, false, false, false]); // 持续离开
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    collapseDelayMs: 420,
    expandDelayMs: 220,
  });
  ctrl.start(); // 初始 expanded
  assert.equal(ctrl.state, "expanded", "初始 expanded");
  clock = 200;
  await scheduler.tick(); // 离开，dwellStartedAt=200
  clock = 500; // 500-200=300，未达 420
  await scheduler.tick();
  assert.equal(manager.calls.length, 0, "300ms 不足 420，不收起");
  clock = 650; // 650-200=450，达 420
  await scheduler.tick();
  assert.equal(manager.calls.length, 1, "达 420ms 收起");
  assert.equal(manager.calls[0], "orb", "收回 orb");
  ctrl.stop();
});

test("hover: card/bar 可见时静默（不 probe、不切换）", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("card");
  const probe = makeFakeProbe([true, true]); // 即便命中也不应触发
  const scheduler = new ManualScheduler();
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => 1000,
    scheduler,
  });
  ctrl.start();
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(manager.calls.length, 0, "card 可见时不切换");
  ctrl.stop();
});

test("hover: showOnly 失败回滚状态", async () => {
  const manager = makeFakeManager();
  manager.setShowOnlyError(new Error("boom"));
  const probe = makeFakeProbe([true, true]); // 命中
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
  });
  ctrl.start();
  clock = 300;
  await scheduler.tick(); // 达 220，尝试展开 → showOnly reject
  // 等 microtask 让 .catch 回滚
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(ctrl.state, "collapsed", "展开失败回滚到 collapsed");
  ctrl.stop();
});

test("hover: 实测经过时间不随 probe 间隔漂移", async () => {
  // 即使 probe 间隔很长（模拟 probe 慢），只要 now() 反映真实经过时间，220ms 阈值准确。
  const manager = makeFakeManager();
  const probe = makeFakeProbe([true, true, true]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
    probeMs: 80,
  });
  ctrl.start();
  // 第一次 probe 在 t=0（dwell start=0）
  await scheduler.tick();
  // 第二次 probe 在 t=250（远超 80ms probeMs，模拟 probe 慢）
  clock = 250;
  await scheduler.tick();
  assert.equal(manager.calls.length, 1, "用实测时间 250>220 立即展开，不等下一个 probeMs 周期");
  ctrl.stop();
});

test("P1-1: suspend 期间连续 over 也不展开（拖动>220ms 不展开）", async () => {
  const manager = makeFakeManager();
  const probe = makeFakeProbe([true, true, true, true, true]); // 持续命中
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
  });
  ctrl.start();
  ctrl.suspend(); // 拖动 pointerdown（suspend 主动发 showOnly(orb) 抢占）
  clock = 100;
  await scheduler.tick();
  clock = 300; // 远超 220
  await scheduler.tick();
  clock = 500;
  await scheduler.tick();
  assert.ok(
    !manager.calls.includes("edge-capsule"),
    "suspend 期间即使 over 满足 220ms 也不展开 edge-capsule",
  );
  ctrl.stop();
});

test("P1-1: resume 后鼠标仍在 Orb 上不展开；离开再进入才展开", async () => {
  const manager = makeFakeManager();
  // resume 后：over（仍在 Orb）、over、not-over（离开）、over（重新进入）、over
  const probe = makeFakeProbe([true, true, false, true, true, true]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
  });
  ctrl.start();
  ctrl.suspend();
  ctrl.resume(); // 拖动结束，鼠标仍在 Orb 上
  clock = 100;
  await scheduler.tick(); // over（仍在 Orb）→ requireLeaveBeforeExpand 未清，不累计 dwell
  clock = 400; // 远超 220
  await scheduler.tick(); // over → 仍不展开
  assert.ok(!manager.calls.includes("edge-capsule"), "resume 后鼠标仍在 Orb 上不展开 edge-capsule");
  clock = 500;
  await scheduler.tick(); // not-over（离开）→ 清 requireLeaveBeforeExpand
  clock = 600;
  await scheduler.tick(); // over（重新进入）→ 开始累计 dwell
  clock = 850; // +250ms ≥ 220
  await scheduler.tick(); // over → 展开
  assert.ok(manager.calls.includes("edge-capsule"), "离开再重新进入 220ms 后展开");
  ctrl.stop();
});

test("P2-1: onSurfaceChanged(edge-capsule) 后离开 420ms 收起（click 展开同步状态）", async () => {
  const manager = makeFakeManager();
  manager.setVisibleSurface("edge-capsule"); // click 已展开
  // over（点击后鼠标在 capsule）、not-over（移开）、not-over
  const probe = makeFakeProbe([true, false, false, false]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(manager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
    collapseDelayMs: 420,
  });
  ctrl.start();
  // 模拟 renderer click → manager 通知 → controller 同步 expanded
  ctrl.onSurfaceChanged("edge-capsule");
  assert.equal(ctrl.state, "expanded", "click 后 controller 同步为 expanded");
  clock = 100;
  await scheduler.tick(); // over（仍在）→ 保持，不收起
  clock = 200;
  await scheduler.tick(); // not-over（移开）→ 开始离开计时
  clock = 650; // +450ms ≥ 420
  await scheduler.tick(); // not-over → 收起
  assert.equal(manager.calls.length, 1, "click 展开后移开 420ms 收起");
  assert.equal(manager.calls[0], "orb");
  ctrl.stop();
});

test("P1: pending expand → suspend → resume → resolve：最终 orb/collapsed", async () => {
  // 复现报告的失败时序：pending expand + suspend + resume（suspended 重置）+ resolve。
  // 修复要求：cancel token 独立于 suspended，resume 不重置；resolve 后丢弃展开。
  const calls: string[] = [];
  let visibleSurface: "orb" | "edge-capsule" | undefined = "orb";
  const holder = { resolveExpand: null as (() => void) | null };
  const slowManager = {
    getVisibleSurface: () => visibleSurface,
    getVisibleWindow: () => ({ isDestroyed: () => false }),
    showOnly: (kind: string) =>
      new Promise<void>((res) => {
        calls.push(kind);
        if (kind === "edge-capsule") {
          holder.resolveExpand = res; // 展开挂起，测试控制何时 resolve
        } else {
          visibleSurface = kind as typeof visibleSurface;
          res(); // orb 立即 resolve（suspend 主动抢占）
        }
      }),
  };
  const probe = makeFakeProbe([true, true]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(slowManager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
  });
  ctrl.start();
  clock = 100;
  await scheduler.tick(); // over, dwell=100
  clock = 400; // ≥220
  await scheduler.tick(); // 触发 showOnly(edge-capsule), pending
  assert.equal(calls[0], "edge-capsule", "展开请求已发出");

  // 1. suspend（主动发 orb 抢占，token 自增）
  ctrl.suspend();
  assert.ok(calls.includes("orb"), "suspend 主动发 showOnly(orb) 抢占");

  // 2. resume（suspended 重置，但 cancel token 不重置）
  ctrl.resume();

  // 3. resolve 旧展开请求 → .then 检测 cancel token 已变 → 丢弃（state 回 collapsed）
  holder.resolveExpand?.();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(ctrl.state, "collapsed", "旧展开被 cancel，最终 collapsed");
  assert.equal(visibleSurface, "orb", "可见 surface 是 orb（suspend 的抢占生效）");
  ctrl.stop();
});

test("P1: 旧展开取消后，离开再进入产生新展开：旧请求迟到不覆盖新展开", async () => {
  // 时序：展开A pending → suspend(cancel A) → resume → 离开(not-over) → 重新进入(over) → 展开B
  // → 展开A 迟到完成 → 不能把 B 的 expanded 覆盖回 collapsed。
  const calls: string[] = [];
  let visibleSurface: "orb" | "edge-capsule" | undefined = "orb";
  const holder = { resolveA: null as (() => void) | null };
  let expandCount = 0;
  const slowManager = {
    getVisibleSurface: () => visibleSurface,
    getVisibleWindow: () => ({ isDestroyed: () => false }),
    showOnly: (kind: string) =>
      new Promise<void>((res) => {
        calls.push(kind);
        if (kind === "edge-capsule") {
          expandCount += 1;
          if (expandCount === 1) {
            holder.resolveA = res; // 第一次展开（A）挂起
          } else {
            visibleSurface = "edge-capsule";
            res(); // 后续展开立即 resolve
          }
        } else {
          visibleSurface = kind as typeof visibleSurface;
          res();
        }
      }),
  };
  // probe 序列：over(触发A) / over / not-over(离开) / over(重新进入) / over(展开B)
  const probe = makeFakeProbe([true, true, false, true, true]);
  const scheduler = new ManualScheduler();
  let clock = 0;
  const ctrl = new OrbHoverController(slowManager as never, probe as never, {
    now: () => clock,
    scheduler,
    expandDelayMs: 220,
  });
  ctrl.start();
  clock = 100;
  await scheduler.tick(); // over, dwell=100
  clock = 400;
  await scheduler.tick(); // 展开 A pending
  // suspend 取消 A + resume
  ctrl.suspend();
  ctrl.resume();
  // 离开（not-over）→ 清 requireLeaveBeforeExpand
  clock = 500;
  await scheduler.tick();
  // 重新进入 over → 开始累计 dwell
  clock = 600;
  await scheduler.tick();
  // 达 220ms → 展开 B（新 cancel token，立即 resolve，state=expanded）
  clock = 900;
  await scheduler.tick();
  assert.equal(ctrl.state, "expanded", "离开再进入产生新展开 B，state=expanded");

  // 现在 A 迟到完成（cancel token 已变）→ 丢弃，不能回滚 state
  holder.resolveA?.();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(ctrl.state, "expanded", "旧 A 迟到完成不覆盖新 B 的 expanded");
  ctrl.stop();
});
