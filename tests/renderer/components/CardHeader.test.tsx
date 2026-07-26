import React from "react";

import "./jsdom-setup";
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import "../../../renderer/src/i18n";
import i18n from "i18next";
import { CardHeader } from "../../../renderer/src/components/card/CardHeader";
import { useDisplayStore } from "../../../renderer/src/stores/displayStore";
import { useThemeStore } from "../../../renderer/src/stores/themeStore";

const preferenceCalls: unknown[][] = [];

beforeEach(() => {
  i18n.changeLanguage("zh-CN");
  preferenceCalls.length = 0;
  useDisplayStore.setState({ displayPreference: "auto" });
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  Object.defineProperty(window, "monitor", {
    configurable: true,
    value: {
      setPreference: (...args: unknown[]) => preferenceCalls.push(args),
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "monitor");
});

function renderHeader(): void {
  render(
    <CardHeader
      clientKind="codex"
      planType="pro"
      onSwitchClient={() => undefined}
      onClose={() => undefined}
    />,
  );
}

test("CardHeader: 标题栏使用 Fluent 主题/展示模式/关闭图标，无 2×2 文字占位", () => {
  renderHeader();

  assert.ok(screen.getByRole("button", { name: "主题：跟随系统" }));
  assert.ok(screen.getByRole("button", { name: "切换展示模式" }));
  assert.ok(screen.getByRole("button", { name: "关闭" }));
  assert.equal(screen.queryByText("2×2"), null);
  assert.ok(document.querySelector('svg[data-icon-name="themeAuto"]'));
  assert.ok(document.querySelector('svg[data-icon-name="displayMode"]'));
  assert.ok(document.querySelector('svg[data-icon-name="close"]'));
});

test("CardHeader: 展示模式菜单列出四态并标记当前项", () => {
  renderHeader();
  const trigger = screen.getByRole("button", { name: "切换展示模式" });

  fireEvent.click(trigger);

  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  const items = screen.getAllByRole("menuitemradio");
  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((item) => item.textContent?.trim()),
    ["自动", "卡片", "指示条", "悬浮球"],
  );
  assert.equal(
    screen.getByRole("menuitemradio", { name: "自动" }).getAttribute("aria-checked"),
    "true",
  );
});

test("CardHeader: 选择指示条后乐观更新、写 IPC 并关闭菜单", () => {
  renderHeader();
  fireEvent.click(screen.getByRole("button", { name: "切换展示模式" }));

  fireEvent.click(screen.getByRole("menuitemradio", { name: "指示条" }));

  assert.equal(useDisplayStore.getState().displayPreference, "indicator-bar");
  assert.deepEqual(preferenceCalls, [["displayPreference", "indicator-bar"]]);
  assert.equal(screen.queryByRole("menu"), null);
});

test("CardHeader: 主题按钮按 auto → light → dark → auto 三态循环", () => {
  renderHeader();

  fireEvent.click(screen.getByRole("button", { name: "主题：跟随系统" }));
  assert.equal(useThemeStore.getState().preference, "light");
  assert.ok(screen.getByRole("button", { name: "主题：浅色" }));

  fireEvent.click(screen.getByRole("button", { name: "主题：浅色" }));
  assert.equal(useThemeStore.getState().preference, "dark");
  assert.ok(screen.getByRole("button", { name: "主题：深色" }));

  fireEvent.click(screen.getByRole("button", { name: "主题：深色" }));
  assert.equal(useThemeStore.getState().preference, "auto");
  assert.deepEqual(preferenceCalls, [
    ["themePreference", "light"],
    ["themePreference", "dark"],
    ["themePreference", "auto"],
  ]);
});
