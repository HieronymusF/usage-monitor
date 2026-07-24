/**
 * theme-store 单元测试。
 *
 * 测三态切换逻辑（resolveTheme 纯函数 + store 状态机）。
 * 用注入 ThemeDomSink 收集 class 变化，避免依赖 document（node:test 无 DOM）。
 *
 * 纪律 B：状态可判别；这里验证 auto/light/dark 三种 preference 都能产生正确的 resolved。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "../../renderer/src/stores/themeStore.ts";

// ---------- resolveTheme 纯函数（不依赖 zustand）----------

test("resolveTheme: preference=light → 永远 light（忽略系统）", () => {
  assert.equal(resolveTheme("light", "light"), "light");
  assert.equal(resolveTheme("light", "dark"), "light");
});

test("resolveTheme: preference=dark → 永远 dark", () => {
  assert.equal(resolveTheme("dark", "light"), "dark");
  assert.equal(resolveTheme("dark", "dark"), "dark");
});

test("resolveTheme: preference=auto → 跟随系统", () => {
  assert.equal(resolveTheme("auto", "light"), "light");
  assert.equal(resolveTheme("auto", "dark"), "dark");
});

test("resolveTheme: 三态覆盖矩阵完整", () => {
  const matrix: Array<{ pref: ThemePreference; sys: ResolvedTheme; expected: ResolvedTheme }> = [
    { pref: "auto", sys: "light", expected: "light" },
    { pref: "auto", sys: "dark", expected: "dark" },
    { pref: "light", sys: "light", expected: "light" },
    { pref: "light", sys: "dark", expected: "light" },
    { pref: "dark", sys: "light", expected: "dark" },
    { pref: "dark", sys: "dark", expected: "dark" },
  ];
  for (const { pref, sys, expected } of matrix) {
    assert.equal(
      resolveTheme(pref, sys),
      expected,
      `preference=${pref} + system=${sys} 应解析为 ${expected}`,
    );
  }
});

// ---------- store 状态机（用 zustand 的 getState，不依赖 React）----------
//
// 注意：zustand 的 create 返回的 hook 同时是 store（有 .getState/.setState）。
// 在 node:test 下可以直接用，无需 React 渲染。

test("store: 初始状态 preference=auto, resolved=light, systemTheme=light", async () => {
  // 动态 import 避免在模块加载时就触发 DOM 操作
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  // 重置到初始状态
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  const state = useThemeStore.getState();
  assert.equal(state.preference, "auto");
  assert.equal(state.resolved, "light");
  assert.equal(state.systemTheme, "light");
});

test("store: setPreference('dark') → resolved=dark 且 applyTheme 写入 DOM", async () => {
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  const appliedClasses: string[] = [];
  const sink = { setClass: (cls: string) => appliedClasses.push(cls) };

  useThemeStore.getState().setPreference("dark");
  useThemeStore.getState().applyTheme(sink);

  assert.equal(useThemeStore.getState().preference, "dark");
  assert.equal(useThemeStore.getState().resolved, "dark");
  assert.deepEqual(appliedClasses, ["dark"]);
});

test("store: auto 模式下 setSystemTheme('dark') → resolved 跟随变 dark", async () => {
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  const appliedClasses: string[] = [];
  const sink = { setClass: (cls: string) => appliedClasses.push(cls) };

  useThemeStore.getState().setSystemTheme("dark");
  useThemeStore.getState().applyTheme(sink);

  assert.equal(useThemeStore.getState().systemTheme, "dark");
  assert.equal(useThemeStore.getState().resolved, "dark", "auto 模式应跟随系统变 dark");
  assert.deepEqual(appliedClasses, ["dark"]);
});

test("store: light 强制模式下 setSystemTheme('dark') → resolved 仍是 light", async () => {
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  useThemeStore.setState({ preference: "light", resolved: "light", systemTheme: "light" });

  useThemeStore.getState().setSystemTheme("dark");

  assert.equal(useThemeStore.getState().systemTheme, "dark");
  assert.equal(useThemeStore.getState().resolved, "light", "light 强制不跟随系统");
});

test("store: dark 强制模式下切回 auto + 系统为 light → resolved 变 light", async () => {
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  useThemeStore.setState({ preference: "dark", resolved: "dark", systemTheme: "dark" });

  useThemeStore.getState().setSystemTheme("light");
  useThemeStore.getState().setPreference("auto");

  assert.equal(useThemeStore.getState().resolved, "light");
});

// ---------- hydrateFromPreferences（Milestone E-F/G：主进程真相源）----------

test("store: hydrateFromPreferences 应用主进程推送的 themePreference", async () => {
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "dark" });
  const appliedClasses: string[] = [];
  const sink = { setClass: (cls: string) => appliedClasses.push(cls) };

  // 主进程推送 dark
  useThemeStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "dark",
    displayPreference: "auto",
    activeClient: "codex",
    language: "zh-CN",
  });
  useThemeStore.getState().applyTheme(sink);

  assert.equal(useThemeStore.getState().preference, "dark");
  assert.equal(useThemeStore.getState().resolved, "dark");
  assert.deepEqual(appliedClasses, ["dark"]);
});

test("store: hydrateFromPreferences 幂等（值一致无副作用）", async () => {
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  useThemeStore.setState({ preference: "dark", resolved: "dark", systemTheme: "light" });
  let applyCount = 0;
  const origApply = useThemeStore.getState().applyTheme;
  // 监控 applyTheme 是否被调（hydrate 一致时应早 return，不调 applyTheme）
  useThemeStore.getState().applyTheme = () => {
    applyCount++;
  };

  useThemeStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "dark", // 与当前一致
    displayPreference: "auto",
    activeClient: "codex",
    language: "zh-CN",
  });

  assert.equal(applyCount, 0, "值一致时 hydrate 不触发 applyTheme");
  // 还原
  useThemeStore.getState().applyTheme = origApply;
});

test("store: hydrateFromPreferences auto 模式跟随 systemTheme", async () => {
  const { useThemeStore } = await import("../../renderer/src/stores/themeStore.ts");
  useThemeStore.setState({ preference: "light", resolved: "light", systemTheme: "dark" });

  useThemeStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "auto",
    displayPreference: "auto",
    activeClient: "codex",
    language: "zh-CN",
  });

  assert.equal(useThemeStore.getState().resolved, "dark", "auto + systemDark → dark");
});
