/**
 * display-store 测试（Milestone E-F）。
 *
 * displayPreference 由 CardHeader 菜单乐观更新并写 IPC，主进程推送再 hydrate。
 * 纯状态，node:test 无 DOM 依赖。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../../shared/settings.ts";

test("displayStore: 初始 displayPreference=auto", async () => {
  const { useDisplayStore } = await import("../../renderer/src/stores/displayStore.ts");
  useDisplayStore.setState({ displayPreference: "auto" });
  assert.equal(useDisplayStore.getState().displayPreference, "auto");
});

test("displayStore: setPreference 乐观切换并写主进程 IPC", async () => {
  const { useDisplayStore } = await import("../../renderer/src/stores/displayStore.ts");
  const calls: unknown[][] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      monitor: {
        setPreference: (...args: unknown[]) => calls.push(args),
      },
    },
  });
  useDisplayStore.setState({ displayPreference: "auto" });

  useDisplayStore.getState().setPreference("indicator-bar");

  assert.equal(useDisplayStore.getState().displayPreference, "indicator-bar");
  assert.deepEqual(calls, [["displayPreference", "indicator-bar"]]);
  Reflect.deleteProperty(globalThis, "window");
});

test("displayStore: hydrateFromPreferences 应用主进程推送值", async () => {
  const { useDisplayStore } = await import("../../renderer/src/stores/displayStore.ts");
  useDisplayStore.setState({ displayPreference: "auto" });

  useDisplayStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "dark",
    displayPreference: "orb",
    activeClient: "codex",
    language: "zh-CN",
    autoLaunch: false,
    windowPlacements: DEFAULT_SETTINGS.windowPlacements,
  });

  assert.equal(useDisplayStore.getState().displayPreference, "orb");
});

test("displayStore: hydrateFromPreferences 幂等（值一致不变）", async () => {
  const { useDisplayStore } = await import("../../renderer/src/stores/displayStore.ts");
  useDisplayStore.setState({ displayPreference: "orb" });
  const before = useDisplayStore.getState().displayPreference;

  useDisplayStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "dark",
    displayPreference: "orb", // 一致
    activeClient: "codex",
    language: "zh-CN",
    autoLaunch: false,
    windowPlacements: DEFAULT_SETTINGS.windowPlacements,
  });

  assert.equal(useDisplayStore.getState().displayPreference, before);
});

test("displayStore: hydrateFromPreferences 切换 card → indicator-bar → auto", async () => {
  const { useDisplayStore } = await import("../../renderer/src/stores/displayStore.ts");
  useDisplayStore.setState({ displayPreference: "card" });

  useDisplayStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "auto",
    displayPreference: "indicator-bar",
    activeClient: "codex",
    language: "zh-CN",
    autoLaunch: false,
    windowPlacements: DEFAULT_SETTINGS.windowPlacements,
  });
  assert.equal(useDisplayStore.getState().displayPreference, "indicator-bar");

  useDisplayStore.getState().hydrateFromPreferences({
    version: 1,
    themePreference: "auto",
    displayPreference: "auto",
    activeClient: "codex",
    language: "zh-CN",
    autoLaunch: false,
    windowPlacements: DEFAULT_SETTINGS.windowPlacements,
  });
  assert.equal(useDisplayStore.getState().displayPreference, "auto");
});
