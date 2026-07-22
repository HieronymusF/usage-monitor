import React from "react";
/**
 * useCardWindowResize 测试。
 *
 * 验证客户端切换 resize 链路的 renderer 端入口：
 *   vm.client.kind 变化 → window.monitor.resizeCardWindow(kind) 被调用
 *
 * 完整链路（ipcMain → windowManager → BrowserWindow.setSize）是 Electron main 进程，
 * 需要集成测试或 e2e。本测试只覆盖 renderer 侧契约。
 *
 * 边界：
 * - kind=null（loading/offline）：不调用 resize
 * - kind="codex" → kind="zcode"：调用 1 次，参数 "zcode"
 * - kind 不变：不重复调用（useEffect 依赖 [kind]）
 * - window.monitor 缺失（preview 模式）：静默跳过，不报错
 */

import "./components/jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";
import { useCardWindowResize } from "../../renderer/src/hooks/useCardWindowResize";

afterEach(cleanup);

/** 测试 host 组件，传 kind 给 hook，便于 rerender 测试 kind 变化。 */
function Host({ kind }: { kind: "codex" | "zcode" | null | undefined }) {
  useCardWindowResize(kind);
  return React.createElement("div", { "data-testid": "host" });
}

/** 装 window.monitor mock，返回调用记录数组。每次 test 前清空。 */
function installMockMonitor(): { calls: string[] } {
  const calls: string[] = [];
  (
    globalThis as {
      window: typeof globalThis & { monitor?: { resizeCardWindow?: (k: string) => void } };
    }
  ).window.monitor = {
    resizeCardWindow: (k: string) => {
      calls.push(k);
    },
  };
  return { calls };
}

test("useCardWindowResize: kind='codex' mount 时调 resizeCardWindow('codex')", () => {
  const { calls } = installMockMonitor();
  render(React.createElement(Host, { kind: "codex" }));
  assert.deepEqual(calls, ["codex"]);
});

test("useCardWindowResize: kind='zcode' mount 时调 resizeCardWindow('zcode')", () => {
  const { calls } = installMockMonitor();
  render(React.createElement(Host, { kind: "zcode" }));
  assert.deepEqual(calls, ["zcode"]);
});

test("useCardWindowResize: kind=null 不调 resize（loading/offline 保持上次尺寸）", () => {
  const { calls } = installMockMonitor();
  render(React.createElement(Host, { kind: null }));
  assert.deepEqual(calls, []);
});

test("useCardWindowResize: kind 从 codex 切到 zcode 时多调一次 'zcode'", () => {
  const { calls } = installMockMonitor();
  const { rerender } = render(React.createElement(Host, { kind: "codex" }));
  assert.deepEqual(calls, ["codex"]);
  rerender(React.createElement(Host, { kind: "zcode" }));
  assert.deepEqual(calls, ["codex", "zcode"]);
});

test("useCardWindowResize: kind 不变时不重复调用", () => {
  const { calls } = installMockMonitor();
  const { rerender } = render(React.createElement(Host, { kind: "codex" }));
  rerender(React.createElement(Host, { kind: "codex" }));
  rerender(React.createElement(Host, { kind: "codex" }));
  assert.deepEqual(calls, ["codex"], "useEffect 依赖 [kind]，kind 不变只调一次");
});

test("useCardWindowResize: window.monitor 缺失时不报错（preview 模式）", () => {
  // 删除 monitor mock
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = undefined;
  // 不应抛错
  assert.doesNotThrow(() => {
    render(React.createElement(Host, { kind: "codex" }));
  });
});
