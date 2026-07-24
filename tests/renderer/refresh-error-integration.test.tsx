import React from "react";
/**
 * refresh-error 数据链集成测试（item 1）。
 *
 * v28 修复：useUsageViewModel 从 usageStore.error 读错误（不再只读 SWR error）。
 * refresh 失败时 useUsageData.refresh 把错误推到 store.error，vm 读到后 dataState → refresh-error。
 *
 * 端到端验证（不只断言 store.error）：
 *   refreshUsage reject → vm.client 保留（旧快照）→ vm.dataState === "refresh-error"
 */

import "./components/jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import { useUsageViewModel } from "../../renderer/src/hooks/useUsageViewModel";
import { useUsageStore } from "../../renderer/src/stores/usageStore";
import type { UsageViewModelWithRefresh } from "../../renderer/src/hooks/useUsageViewModel";
import { codexDual } from "../../renderer/src/domain/fixtures/snapshots";

afterEach(cleanup);

/** Host 组件：暴露 vm（含 dataState/client/refresh）给测试断言。 */
function VmHost({ onVm }: { onVm: (vm: UsageViewModelWithRefresh) => void }) {
  const vm = useUsageViewModel();
  React.useEffect(() => {
    onVm(vm);
  });
  return React.createElement("div", { "data-testid": "host" });
}

test("refresh-error 集成: refreshUsage reject → 旧快照保留 + dataState === refresh-error", async () => {
  // 初始 getUsage 成功 → store 有快照；refreshUsage reject
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    getUsage: async () => codexDual,
    refreshUsage: async () => {
      throw new Error("bridge unreachable (integration test)");
    },
    getContext: async () => ({ platform: "win32", surface: "edge-capsule", systemTheme: "light" }),
    onSystemThemeChange: () => () => {},
    onUsageChanged: () => () => {},
    resizeCardWindow: () => {},
    showSurface: () => {},
  };
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });

  let latest: UsageViewModelWithRefresh | null = null;
  render(React.createElement(VmHost, { onVm: (vm) => (latest = vm) }));

  // 等 SWR 首次 resolve：client 非空，dataState=fresh（无错误）
  await waitFor(() => {
    assert.ok(latest?.client !== null, "初始 getUsage 成功后应有 client");
  });
  const initialDataState = latest!.dataState;
  assert.ok(
    initialDataState === "fresh" || initialDataState === "stale",
    `初始无错误应 fresh/stale，实际: ${initialDataState}`,
  );
  assert.ok(latest!.client !== null, "初始有 client 数据");

  // 调 refresh（refreshUsage 会 reject）
  const result = await latest!.refresh();
  assert.equal(result, null, "refresh 失败应返回 null");

  // 端到端断言：dataState 进 refresh-error，且旧 client 保留
  await waitFor(() => {
    assert.equal(
      latest!.dataState,
      "refresh-error",
      `refresh 失败后 dataState 应 === 'refresh-error'，实际: ${latest!.dataState}`,
    );
  });
  assert.ok(latest!.client !== null, "refresh 失败后旧 client 应保留（不显示空白）");
  assert.ok(latest!.client !== undefined, "client 应存在");
});

test("refresh-error 集成: refreshUsage 成功 → dataState 不进 refresh-error", async () => {
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    getUsage: async () => codexDual,
    refreshUsage: async () => codexDual,
    getContext: async () => ({ platform: "win32", surface: "edge-capsule", systemTheme: "light" }),
    onSystemThemeChange: () => () => {},
    onUsageChanged: () => () => {},
    resizeCardWindow: () => {},
    showSurface: () => {},
  };
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });

  let latest: UsageViewModelWithRefresh | null = null;
  render(React.createElement(VmHost, { onVm: (vm) => (latest = vm) }));

  await waitFor(() => {
    assert.ok(latest?.client !== null, "初始有 client");
  });

  await latest!.refresh();

  // 成功路径：不进 refresh-error
  assert.notEqual(latest!.dataState, "refresh-error", "refresh 成功不应进 refresh-error");
  assert.ok(latest!.client !== null, "client 保留");
});
