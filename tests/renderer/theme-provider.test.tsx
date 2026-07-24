/**
 * ThemeProvider 测试（验收轮 4 P2-b）。
 *
 * 覆盖：
 * - getContext reject / getPreferences reject 不产生 unhandled rejection（显式 catch）。
 * - 失败后保留本地默认，仍渲染 children（不阻止渲染）。
 * - unmount 后迟到的 resolve/reject 不更新 store/i18n（active guard）。
 *
 * 检测 unhandled rejection：测试期间挂 process.on("unhandledRejection") 收集，
 * 若 ThemeProvider 漏 catch 会在此暴露。
 */
import React from "react";
import "./components/jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import { ThemeProvider } from "../../renderer/src/components/ThemeProvider";
import { useThemeStore } from "../../renderer/src/stores/themeStore";
import { useUsageStore } from "../../renderer/src/stores/usageStore";
import { useDisplayStore } from "../../renderer/src/stores/displayStore";

afterEach(cleanup);

/** 挂载全局 unhandledRejection 捕获器，返回 [collector, detach]。 */
function trackUnhandled(): [Array<unknown>, () => void] {
  const collected: unknown[] = [];
  const handler = (reason: unknown): void => {
    collected.push(reason);
  };
  process.on("unhandledRejection", handler);
  return [collected, () => process.off("unhandledRejection", handler)];
}

/** 等一拍让微任务跑完（含 reject handler）。 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface MonitorMock {
  getContext?: () => Promise<unknown>;
  getPreferences?: () => Promise<unknown>;
  onSystemThemeChange?: () => () => void;
  onPreferenceChanged?: () => () => void;
  onUsageChanged?: () => () => void;
}

function setMonitor(mock: MonitorMock): void {
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = mock;
}

function resetStores(): void {
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  useUsageStore.setState({ activeClient: "codex", snapshot: null, error: null });
  useDisplayStore.setState({ displayPreference: "auto" });
}

test("ThemeProvider: getContext reject 不产生 unhandled rejection，仍渲染 children", async () => {
  resetStores();
  setMonitor({
    getContext: async () => {
      throw new Error("context ipc failed (test)");
    },
    getPreferences: async () => ({
      version: 1,
      themePreference: "auto",
      displayPreference: "auto",
      activeClient: "codex",
      language: "en",
    }),
    onSystemThemeChange: () => () => {},
    onPreferenceChanged: () => () => {},
    onUsageChanged: () => () => {},
  });
  const [unhandled, detach] = trackUnhandled();

  render(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement("div", { "data-testid": "child" }, "hello"),
    ),
  );

  // children 应渲染（失败不阻止）。
  assert.ok(screen.getByTestId("child"), "children 已渲染");
  assert.equal(screen.getByTestId("child").textContent, "hello");

  // 等 reject handler 跑完。
  await flushMicrotasks();
  detach();
  assert.equal(
    unhandled.length,
    0,
    `getContext reject 不应产生 unhandled rejection，实际: ${unhandled.length}`,
  );
});

test("ThemeProvider: getPreferences reject 不产生 unhandled rejection，保留本地默认", async () => {
  resetStores();
  setMonitor({
    getContext: async () => ({ platform: "win32", surface: "card", systemTheme: "light" }),
    getPreferences: async () => {
      throw new Error("preferences ipc failed (test)");
    },
    onSystemThemeChange: () => () => {},
    onPreferenceChanged: () => () => {},
    onUsageChanged: () => () => {},
  });
  const [unhandled, detach] = trackUnhandled();

  render(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement("div", { "data-testid": "child" }),
    ),
  );

  assert.ok(screen.getByTestId("child"), "失败后仍渲染 children");
  await flushMicrotasks();
  detach();
  assert.equal(unhandled.length, 0, "getPreferences reject 不应产生 unhandled rejection");
  // 保留本地默认（未被 hydrate 覆盖）。
  assert.equal(useThemeStore.getState().preference, "auto", "失败时保留默认 theme preference");
});

test("ThemeProvider: unmount 后迟到的 resolve 不更新 store（active guard）", async () => {
  resetStores();
  // 让 getPreferences 的 resolve 延迟到 unmount 之后。
  let resolvePrefs: (s: unknown) => void = () => {};
  setMonitor({
    getContext: async () => ({ platform: "win32", surface: "card", systemTheme: "light" }),
    getPreferences: () =>
      new Promise((resolve) => {
        resolvePrefs = resolve;
      }),
    onSystemThemeChange: () => () => {},
    onPreferenceChanged: () => () => {},
    onUsageChanged: () => () => {},
  });

  const { unmount } = render(React.createElement(ThemeProvider, null, React.createElement("div")));
  // unmount（此时 getPreferences 还 pending）。
  unmount();
  // unmount 后才 resolve——active=false，不应 hydrate store。
  resolvePrefs({
    version: 1,
    themePreference: "dark",
    displayPreference: "orb",
    activeClient: "zcode",
    language: "en",
  });
  await flushMicrotasks();

  // store 应保持 unmount 前的默认，未被迟到的 resolve 覆盖。
  assert.equal(
    useThemeStore.getState().preference,
    "auto",
    "unmount 后迟到 resolve 不更新 themeStore",
  );
  assert.equal(useUsageStore.getState().activeClient, "codex", "不更新 activeClient");
  assert.equal(useDisplayStore.getState().displayPreference, "auto", "不更新 displayPreference");
});

test("ThemeProvider: 成功路径仍正常 hydrate（回归，确保 catch 不误吞正常数据）", async () => {
  resetStores();
  setMonitor({
    getContext: async () => ({ platform: "win32", surface: "card", systemTheme: "dark" }),
    getPreferences: async () => ({
      version: 1,
      themePreference: "dark",
      displayPreference: "orb",
      activeClient: "zcode",
      language: "en",
    }),
    onSystemThemeChange: () => () => {},
    onPreferenceChanged: () => () => {},
    onUsageChanged: () => () => {},
  });

  render(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement("div", { "data-testid": "child" }),
    ),
  );
  assert.ok(screen.getByTestId("child"), "children 渲染");

  // 等 hydrate 完成。
  await waitFor(() => {
    assert.equal(useThemeStore.getState().preference, "dark", "成功 hydrate theme preference");
  });
  assert.equal(useThemeStore.getState().systemTheme, "dark", "getContext 的 systemTheme 应用");
  assert.equal(useUsageStore.getState().activeClient, "zcode", "成功 hydrate activeClient");
  assert.equal(
    useDisplayStore.getState().displayPreference,
    "orb",
    "成功 hydrate displayPreference",
  );
});
