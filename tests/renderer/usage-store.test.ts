/**
 * usageStore 单元测试。
 *
 * 覆盖客户端切换菜单的入口链路（AGENT_LESSONS G4：标准先行）：
 *   用户点 CardHeader "ZCode"
 *     → switchToClient("zcode")
 *     → useUsageStore.setActiveClient("zcode")
 *     → useUsageViewModel 读 activeClient
 *     → toUsageViewModel({ activeClientId: "zcode" })
 *     → pickClientSnapshot fallback
 *     → vm.client.kind === "zcode"
 *
 * pickClientSnapshot 的 fallback 已在 usage-view-model.test.ts 充分覆盖（42 个测试）。
 * 本文件只测 zustand store 本身——CardHeader→store 的入口（之前 0 测试覆盖）。
 *
 * zustand store 是全局单例，每个测试前用 setState 重置到初始状态避免污染。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../../shared/settings.ts";
import { useUsageStore } from "../../renderer/src/stores/usageStore.ts";
import { codexDual } from "../../renderer/src/domain/fixtures/snapshots.ts";

const INITIAL_STATE = {
  activeClient: "codex",
  snapshot: null,
  error: null,
} as const;

/** 每个测试前重置 store 到初始状态。zustand 单例 + setState 覆盖。 */
function resetStore(): void {
  useUsageStore.setState({ ...INITIAL_STATE });
}

test("usageStore: 初始 activeClient = 'codex'", () => {
  resetStore();
  assert.equal(useUsageStore.getState().activeClient, "codex");
});

test("usageStore: setActiveClient('zcode') 切换 activeClient", () => {
  resetStore();
  useUsageStore.getState().setActiveClient("zcode");
  assert.equal(useUsageStore.getState().activeClient, "zcode");
});

test("usageStore: setActiveClient('codex') 切回 codex", () => {
  resetStore();
  useUsageStore.getState().setActiveClient("zcode");
  useUsageStore.getState().setActiveClient("codex");
  assert.equal(useUsageStore.getState().activeClient, "codex");
});

test("usageStore: setSnapshot 不影响 activeClient（状态隔离）", () => {
  resetStore();
  useUsageStore.getState().setActiveClient("zcode");
  useUsageStore.getState().setSnapshot(codexDual);
  const state = useUsageStore.getState();
  assert.equal(state.activeClient, "zcode", "setSnapshot 不应重置 activeClient");
  assert.equal(state.snapshot, codexDual);
  assert.equal(state.error, null, "setSnapshot 应同时清 error");
});

test("usageStore: setError 不影响 activeClient（状态隔离）", () => {
  resetStore();
  useUsageStore.getState().setActiveClient("zcode");
  useUsageStore.getState().setError("bridge down");
  const state = useUsageStore.getState();
  assert.equal(state.activeClient, "zcode", "setError 不应重置 activeClient");
  assert.equal(state.error, "bridge down");
});

test("usageStore: setActiveClient 同值不报错（幂等）", () => {
  resetStore();
  useUsageStore.getState().setActiveClient("codex");
  useUsageStore.getState().setActiveClient("codex");
  assert.equal(useUsageStore.getState().activeClient, "codex");
});

test("usageStore: subscribe 在 activeClient 变化时通知（验证 CardHeader→vm 响应链路）", () => {
  resetStore();
  const observed: string[] = [];
  const unsub = useUsageStore.subscribe((state) => {
    observed.push(state.activeClient);
  });
  // zustand subscribe 在每次 setState 后都通知（不只 activeClient 变化）
  useUsageStore.getState().setActiveClient("zcode");
  useUsageStore.getState().setActiveClient("codex");
  unsub();
  // 至少观察到两次状态变化，最后一次是 codex
  assert.ok(observed.length >= 2, "subscribe 应被通知");
  assert.equal(observed[observed.length - 1], "codex", "最后一次应是 codex");
});

// ---------- hydrateFromPreferences（Milestone E-F/G：主进程真相源）----------

test("usageStore: hydrateFromPreferences 应用主进程推送的 activeClient", () => {
  resetStore();
  useUsageStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "auto",
    displayPreference: "auto",
    activeClient: "zcode",
    language: "zh-CN",
    autoLaunch: false,
    windowPlacements: DEFAULT_SETTINGS.windowPlacements,
  });
  assert.equal(useUsageStore.getState().activeClient, "zcode");
});

test("usageStore: hydrateFromPreferences 幂等（值一致不变）", () => {
  resetStore();
  useUsageStore.getState().setActiveClient("zcode");
  useUsageStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "auto",
    displayPreference: "auto",
    activeClient: "zcode", // 一致
    language: "zh-CN",
    autoLaunch: false,
    windowPlacements: DEFAULT_SETTINGS.windowPlacements,
  });
  assert.equal(useUsageStore.getState().activeClient, "zcode");
});
