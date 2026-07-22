import React from "react";
/**
 * useUsageData 测试 — 覆盖 refresh 失败路径（item 3）。
 *
 * v27 修复：refreshUsage reject 时，refresh() 捕获错误推入 SWR error 通道，
 * 让 dataState 进入 refresh-error，同时 keepPreviousData 保留上次有效快照（不显示空白）。
 *
 * 测试策略：
 * - mock window.monitor.getUsage 返回初始快照（成功）
 * - mock window.monitor.refreshUsage reject（模拟 bridge 失败）
 * - 渲染 host 组件（用 useUsageData），等 SWR 首次 resolve
 * - 调 refresh()，断言：error 非空 + snapshot 仍保留（不丢）
 */

import "./components/jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import { useUsageData } from "../../renderer/src/hooks/useUsageData";
import { useUsageStore } from "../../renderer/src/stores/usageStore";
import { codexDual } from "../../renderer/src/domain/fixtures/snapshots";
import type { MultiClientSnapshot } from "../../server/types";

afterEach(cleanup);

/** 测试 host：暴露 useUsageData 的返回值（snapshot/error/refresh）给测试断言。 */
function UsageDataHost({
  onState,
}: {
  onState: (s: {
    snapshot: MultiClientSnapshot | undefined;
    error: unknown;
    refresh: () => Promise<MultiClientSnapshot | null>;
  }) => void;
}) {
  const { snapshot, error, refresh } = useUsageData();
  React.useEffect(() => {
    onState({ snapshot, error, refresh });
  });
  return React.createElement("div", { "data-testid": "host" });
}

test("useUsageData: refreshUsage reject 时返回 null 且保留旧快照 + store 记录错误", async () => {
  // getUsage 成功 → 有快照；refreshUsage reject → refresh 返回 null，快照保留，store.error 非空
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    getUsage: async () => codexDual,
    refreshUsage: async () => {
      throw new Error("bridge unreachable (test)");
    },
  };
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });

  let latest: {
    snapshot: MultiClientSnapshot | undefined;
    error: unknown;
    refresh: () => Promise<unknown>;
  } | null = null;
  render(
    React.createElement(UsageDataHost, {
      onState: (s) => {
        latest = s;
      },
    }),
  );

  // 等 SWR 首次 resolve（getUsage 成功），snapshot 应非 null
  await waitFor(() => {
    assert.ok(latest?.snapshot, "初始 getUsage 成功后应有快照");
  });
  assert.ok(latest!.snapshot, "快照存在（getUsage 成功）");
  assert.ok(!latest!.error, "初始 SWR 无错误");

  // 调 refresh（refreshUsage 会 reject）。refresh 应捕获错误，返回 null（不抛）。
  const result = await latest!.refresh();
  assert.equal(result, null, "refresh 失败时返回 null（成功时返回 snapshot）");

  // 刷新失败后：旧快照应保留（keepPreviousData，不显示空白）
  assert.ok(latest!.snapshot, "refresh 失败后旧快照应保留（不显示空白）");

  // store.error 应被填充（dataState 据此进 refresh-error）
  const storeState = useUsageStore.getState();
  assert.ok(storeState.error !== null, "store.error 应非空（refresh-error 信号）");
  assert.ok(
    typeof storeState.error === "string" && storeState.error.includes("bridge unreachable"),
    `store.error 应含 bridge 错误信息，实际: ${storeState.error}`,
  );
});

test("useUsageData: refreshUsage 成功时更新快照且无错误", async () => {
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    getUsage: async () => codexDual,
    refreshUsage: async () => codexDual,
  };
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });

  let latest: {
    snapshot: MultiClientSnapshot | undefined;
    error: unknown;
    refresh: () => Promise<unknown>;
  } | null = null;
  render(
    React.createElement(UsageDataHost, {
      onState: (s) => {
        latest = s;
      },
    }),
  );

  await waitFor(() => {
    assert.ok(latest?.snapshot, "初始应有快照");
  });

  await latest!.refresh();

  // 成功路径：无错误（SWR error 为 undefined 或 null），快照存在
  assert.ok(!latest!.error, "refresh 成功后无错误");
  assert.ok(latest!.snapshot, "快照存在");
});
