import React from "react";

import "./jsdom-setup";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { cleanup, render } from "@testing-library/react";

import {
  FluentIcon,
  type FluentIconName,
} from "../../../renderer/src/components/foundations/FluentIcon";

afterEach(cleanup);

const ICON_NAMES: readonly FluentIconName[] = [
  "switchClient",
  "refresh",
  "themeAuto",
  "themeLight",
  "themeDark",
  "displayMode",
  "chevronDown",
  "close",
];

test("FluentIcon: 所有语义都渲染正式 Fluent SVG，不再输出字体字符", () => {
  for (const name of ICON_NAMES) {
    const { container, unmount } = render(<FluentIcon name={name} size={16} />);
    const icon = container.querySelector("svg");
    assert.ok(icon, `${name} 应渲染 SVG`);
    assert.equal(icon.getAttribute("data-icon-name"), name);
    assert.equal(icon.getAttribute("font-size"), "16");
    assert.equal(icon.textContent, "", `${name} 不应包含 PUA/Unicode 文本字形`);
    unmount();
  }
});

test("FluentIcon: 主题三态使用互不相同的官方 Fluent 路径", () => {
  const paths = new Set<string>();
  for (const name of ["themeAuto", "themeLight", "themeDark"] as const) {
    const { container, unmount } = render(<FluentIcon name={name} />);
    const pathData = Array.from(container.querySelectorAll("path"))
      .map((path) => path.getAttribute("d") ?? "")
      .join("|");
    assert.ok(pathData.length > 0, `${name} 应包含可见路径`);
    paths.add(pathData);
    unmount();
  }
  assert.equal(paths.size, 3, "Auto、Light、Dark 不得复用同一个近似图标");
});

test("FluentIcon: 展示模式使用官方非等高 2×2 Apps 图标", () => {
  const { container } = render(<FluentIcon name="displayMode" size={16} />);
  const icon = container.querySelector('svg[data-icon-name="displayMode"]');
  assert.ok(icon, "展示模式应渲染 Fluent SVG");
  assert.ok((icon.querySelector("path")?.getAttribute("d") ?? "").length > 0);
  assert.equal(icon.textContent, "", "不得回退为 2×2 文本或 Unicode 图标");
});
