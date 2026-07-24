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
    // 问题 3：useUsageData 现在订阅 onUsageChanged；mock 返回 noop unsubscribe。
    onUsageChanged: () => () => {},
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
    onUsageChanged: () => () => {},
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

test("useUsageData: 主进程推送新快照（onUsageChanged）→ SWR 立即更新，不等轮询（问题 3）", async () => {
  // 用可捕获的 listener：renderer 订阅 onUsageChanged 时我们拿到引用，主动推送新快照。
  let usageListener: ((snapshot: MultiClientSnapshot) => void) | null = null;
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    getUsage: async () => codexDual,
    refreshUsage: async () => codexDual,
    onUsageChanged: (listener: (snapshot: MultiClientSnapshot) => void) => {
      usageListener = listener;
      return () => {
        usageListener = null;
      };
    },
  };
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });

  let latest: {
    snapshot: MultiClientSnapshot | undefined;
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

  // 初始快照是 codexDual。构造一个不同的新快照，模拟主进程广播。
  const freshSnapshot: MultiClientSnapshot = {
    ...codexDual,
    __testFresh: true,
  } as unknown as MultiClientSnapshot;

  // 模拟主进程 broadcastUsage → renderer 收到。
  assert.ok(usageListener, "useUsageData 应订阅 onUsageChanged");
  (usageListener as (snapshot: MultiClientSnapshot) => void)(freshSnapshot);

  // SWR 应立即 mutate 到新快照。
  await waitFor(() => {
    assert.equal(latest?.snapshot, freshSnapshot, "onUsageChanged 推送后 SWR 立即更新为新快照");
  });
});

test("useUsageData: 重复 render 不重复订阅 onUsageChanged（effect 依赖稳定 mutate，问题 2）", async () => {
  // 统计 onUsageChanged 订阅次数。effect 依赖只取 result.mutate（SWR 稳定引用），
  // 所以多次 render 应只订阅一次；若误依赖整个 result 对象会每次 render 重新订阅。
  let subscribeCount = 0;
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    getUsage: async () => codexDual,
    refreshUsage: async () => codexDual,
    onUsageChanged: () => {
      subscribeCount++;
      return () => {};
    },
  };
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });

  const { rerender } = render(React.createElement(UsageDataHost, { onState: () => {} }));

  // 等 SWR 首次 resolve，effect 初次订阅。
  await waitFor(() => assert.ok(subscribeCount >= 1, "初次 render 应订阅一次"));

  const afterFirst = subscribeCount;

  // 触发多次重复 render（不同 props 触发 re-render，但 mutate 引用不变）。
  rerender(React.createElement(UsageDataHost, { onState: () => {} }));
  rerender(React.createElement(UsageDataHost, { onState: () => {} }));
  rerender(React.createElement(UsageDataHost, { onState: () => {} }));

  // 等一拍让任何潜在的 effect 重跑完成。
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(
    subscribeCount,
    afterFirst,
    `重复 render 不应重新订阅（effect 依赖稳定 mutate），实际订阅 ${subscribeCount} 次（首次后 ${afterFirst}）`,
  );
});
