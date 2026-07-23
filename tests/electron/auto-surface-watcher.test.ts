/**
 * AutoSurfaceWatcher 测试 — D-3 切片 1 的前台→surface 调度（CI 安全，无真实 Electron）。
 *
 * AutoSurfaceWatcher 只 `import type` manager（类型擦除），可在 node:test 下测。
 * 注入 fake adapter（可控 processName 序列）+ fake manager（记录 showOnly）+ 手动驱动 scheduler。
 *
 * 覆盖场景：
 * - codex → card / code → indicator-bar / explorer → orb（切换）
 * - powershell → unchanged（不切换，保持当前）
 * - 同一 surface 连续不重复 showOnly（去抖）
 * - adapter reject 不崩、保留当前 surface
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  AutoSurfaceWatcher,
  type AutoSurfaceScheduler,
} from "../../electron/windows/auto-surface-watcher";

function makeFakeManager() {
  const calls: string[] = [];
  let showOnlyError: Error | null = null;
  /** 控制 showOnly 返回 applied=true/false（模拟被抢占）。默认 true。 */
  let appliedResult = true;
  return {
    calls,
    setShowOnlyError(e: Error | null) {
      showOnlyError = e;
    },
    setApplied(a: boolean) {
      appliedResult = a;
    },
    async showOnly(kind: string) {
      calls.push(kind);
      if (showOnlyError) throw showOnlyError;
      return { window: {} as unknown, applied: appliedResult };
    },
  };
}

/** fake adapter：按序列返回可判别结果；序列中 null 表示该次 reject。 */
function makeFakeAdapter(
  sequence: Array<{ kind: "ok"; processName: string | null } | { kind: "error" } | null>,
) {
  let i = 0;
  return {
    async getForegroundProcess() {
      const item = sequence[i] ?? { kind: "error" };
      i += 1;
      if (item === null) throw new Error("simulated detection failure");
      return item;
    },
  };
}

/** 手动驱动 scheduler：捕获 handler，测试调 tick() 触发并 await 完成。 */
class ManualScheduler implements AutoSurfaceScheduler {
  handler: (() => void) | null = null;
  setInterval(handler: () => void): unknown {
    this.handler = handler;
    return {};
  }
  clearInterval(): void {
    this.handler = null;
  }
  async tick(): Promise<void> {
    if (!this.handler) return;
    this.handler();
    // flush 微任务让 #pollOnce 跑完（adapter.getForegroundProcess 是 async）。
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  }
}

test("watcher: codex → card 切换", async () => {
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([{ kind: "ok", processName: "codex" }]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "orb",
    scheduler,
  });
  watcher.start();
  await scheduler.tick();
  assert.equal(manager.calls.length, 1, "切换一次");
  assert.equal(manager.calls[0], "card", "codex → card");
  assert.equal(watcher.lastResolvedSurface, "card");
  watcher.stop();
});

test("watcher: code → indicator-bar 切换", async () => {
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([{ kind: "ok", processName: "code" }]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "orb",
    scheduler,
  });
  watcher.start();
  await scheduler.tick();
  assert.equal(manager.calls[0], "indicator-bar", "code → indicator-bar");
  watcher.stop();
});

test("watcher: explorer → orb 切换", async () => {
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([{ kind: "ok", processName: "explorer" }]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "card",
    scheduler,
  });
  watcher.start();
  await scheduler.tick();
  assert.equal(manager.calls[0], "orb", "explorer → orb");
  watcher.stop();
});

test("watcher: powershell → unchanged 不切换", async () => {
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([{ kind: "ok", processName: "powershell" }]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "card",
    scheduler,
  });
  watcher.start();
  await scheduler.tick();
  assert.equal(manager.calls.length, 0, "powershell = unchanged，不切换");
  assert.equal(watcher.lastResolvedSurface, "card", "lastResolved 不变");
  watcher.stop();
});

test("watcher: 同一 surface 连续不重复 showOnly（去抖）", async () => {
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([
    { kind: "ok", processName: "code" },
    { kind: "ok", processName: "code" },
    { kind: "ok", processName: "code" },
  ]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "orb",
    scheduler,
  });
  watcher.start();
  await scheduler.tick(); // code → indicator-bar
  await scheduler.tick(); // code === lastResolved，跳过
  await scheduler.tick(); // 同上
  assert.equal(manager.calls.length, 1, "连续同一 surface 只切一次");
  watcher.stop();
});

test("watcher: adapter reject 不崩、保留当前 surface", async () => {
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([null, { kind: "ok", processName: "codex" }]); // 第一次 reject
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "orb",
    scheduler,
  });
  watcher.start();
  await scheduler.tick(); // reject → 捕获，不切
  assert.equal(manager.calls.length, 0, "reject 时不切换");
  assert.equal(watcher.lastResolvedSurface, "orb", "保留 lastResolved");
  await scheduler.tick(); // codex → card
  assert.equal(manager.calls[0], "card", "恢复后正常切换");
  watcher.stop();
});

test("watcher: probe error 保持当前 surface（P2-2）", async () => {
  const manager = makeFakeManager();
  // 第一次 error（探针失败），第二次 ok codex。
  const adapter = makeFakeAdapter([{ kind: "error" }, { kind: "ok", processName: "codex" }]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "card",
    scheduler,
  });
  watcher.start();
  await scheduler.tick(); // error → 保持 card，不切
  assert.equal(manager.calls.length, 0, "探针 error 时不切换（保持当前）");
  assert.equal(watcher.lastResolvedSurface, "card", "lastResolved 保持 card");
  await scheduler.tick(); // codex → card（=== lastResolved，debounce 跳过）
  assert.equal(manager.calls.length, 0, "codex 与 card 同 lastResolved，仍不切");
  watcher.stop();
});

test("P1: showOnly 被抢占(applied=false)时不更新 lastResolved（下轮重试）", async () => {
  const manager = makeFakeManager();
  manager.setApplied(false); // 模拟被更新请求抢占
  // 三轮 codex（都应尝试，因 lastResolved 不更新）
  const adapter = makeFakeAdapter([
    { kind: "ok", processName: "codex" },
    { kind: "ok", processName: "codex" },
    { kind: "ok", processName: "codex" },
  ]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "orb",
    scheduler,
  });
  watcher.start();
  await scheduler.tick(); // codex → showOnly(card) applied=false → 不更新 lastResolved
  assert.equal(watcher.lastResolvedSurface, "orb", "被抢占时 lastResolved 保持 orb");
  await scheduler.tick(); // 仍 codex，resolution(card)!==lastResolved(orb) → 再试
  assert.equal(manager.calls.length, 2, "第二轮重新尝试 showOnly(card)");
  assert.equal(watcher.lastResolvedSurface, "orb", "仍被抢占，lastResolved 还是 orb");
  await scheduler.tick();
  assert.equal(manager.calls.length, 3, "第三轮继续重试");
  watcher.stop();
});

test("P1: 重试 applied=true 后才更新 lastResolved", async () => {
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([
    { kind: "ok", processName: "codex" },
    { kind: "ok", processName: "codex" },
  ]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "orb",
    scheduler,
  });
  watcher.start();
  // 第一轮：被抢占
  manager.setApplied(false);
  await scheduler.tick();
  assert.equal(watcher.lastResolvedSurface, "orb", "第一轮被抢占，lastResolved=orb");
  // 第二轮：恢复正常（applied=true）
  manager.setApplied(true);
  await scheduler.tick();
  assert.equal(watcher.lastResolvedSurface, "card", "applied=true 后 lastResolved=card");
  assert.equal(manager.calls.length, 2, "两轮各调一次 showOnly");
  watcher.stop();
});

test("P1: 不产生错误锁死（被抢占后恢复正常，watcher 与 visible 一致）", async () => {
  // 模拟真实复现场景的修复：card 被抢占 → 下轮重试 → 成功 → lastResolved=card → 之后 debounce。
  const manager = makeFakeManager();
  const adapter = makeFakeAdapter([
    { kind: "ok", processName: "codex" }, // card
    { kind: "ok", processName: "codex" }, // card（重试，这次成功）
    { kind: "ok", processName: "codex" }, // card（debounce，不调 showOnly）
  ]);
  const scheduler = new ManualScheduler();
  const watcher = new AutoSurfaceWatcher(adapter as never, manager as never, {
    initialSurface: "orb",
    scheduler,
  });
  watcher.start();
  manager.setApplied(false);
  await scheduler.tick(); // card 被抢占
  manager.setApplied(true);
  await scheduler.tick(); // card 成功 → lastResolved=card
  assert.equal(watcher.lastResolvedSurface, "card");
  const callsBeforeDebounce = manager.calls.length;
  await scheduler.tick(); // codex === card lastResolved → debounce 跳过
  assert.equal(
    manager.calls.length,
    callsBeforeDebounce,
    "lastResolved 正确后 debounce，不再调 showOnly",
  );
  watcher.stop();
});
