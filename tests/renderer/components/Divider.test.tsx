import React from "react";
/**
 * Divider 渲染测试。
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

afterEach(cleanup);
import { Divider } from "../../../renderer/src/components/foundations/Divider";

test("Divider: 默认水平方向，role=separator", () => {
  render(<Divider data-testid="d" />);
  const el = screen.getByTestId("d");
  assert.equal(el.getAttribute("role"), "separator");
  assert.equal(el.getAttribute("aria-orientation"), "horizontal");
});

test("Divider: orientation=vertical 时 aria-orientation=vertical", () => {
  render(<Divider orientation="vertical" data-testid="d" />);
  assert.equal(screen.getByTestId("d").getAttribute("aria-orientation"), "vertical");
});

test("Divider: 用 border color token 作背景", () => {
  render(<Divider data-testid="d" />);
  const el = screen.getByTestId("d");
  // className 含 bg-[var(--c-border)]，jsdom 不解析但能在 class 里找到
  assert.ok(el.className.includes("c-border"));
});
