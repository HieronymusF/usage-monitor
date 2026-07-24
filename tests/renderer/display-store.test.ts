/**
 * display-store 测试（Milestone E-F）。
 *
 * displayPreference 纯监听主进程推送，无独立 setter。测 hydrateFromPreferences。
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
