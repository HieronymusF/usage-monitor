import React from "react";
/**
 * IconButton 渲染测试。
 *
 * 重点验证（P0/P1）：
 * - P0: button 有 position:relative（内部玻璃层才不会扩张到卡片）
 * - P0: 尺寸精确（36/30）
 * - P1-6: Hover/Pressed class 含 Accent 描边混合（--border-mix）
 * - P1-6: title 存在（tooltip）
 * - aria-label 必传且写入
 * - 内部 GlassSurface 是 absolute inset:0 + pointerEvents:none
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

afterEach(cleanup);
import { IconButton } from "../../../renderer/src/components/foundations/IconButton";
import { radius, surfaceSizes } from "../../../renderer/src/styles/tokens";

test("IconButton: P0 - button 自身 position:relative（防玻璃层扩张）", () => {
  render(
    <IconButton aria-label="close" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").style.position, "relative");
});

test("IconButton: P0 - card 尺寸 36×36", () => {
  render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  const el = screen.getByTestId("b");
  assert.equal(el.style.width, `${surfaceSizes.iconButton.card}px`);
  assert.equal(el.style.height, `${surfaceSizes.iconButton.card}px`);
});

test("IconButton: bar 尺寸 30×30", () => {
  render(
    <IconButton aria-label="x" size="bar" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  const el = screen.getByTestId("b");
  assert.equal(el.style.width, `${surfaceSizes.iconButton.bar}px`);
  assert.equal(el.style.height, `${surfaceSizes.iconButton.bar}px`);
});

test("IconButton: 圆角 = button36/button30 token", () => {
  const { rerender } = render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").style.borderRadius, `${radius.button36}px`);
  rerender(
    <IconButton aria-label="x" size="bar" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").style.borderRadius, `${radius.button30}px`);
});

test("IconButton: P1-6 - className 含 hover Accent 24% 描边混合", () => {
  render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  const cls = screen.getByTestId("b").className;
  assert.ok(cls.includes("hover:[--border-mix:24%]"), "hover 应设 --border-mix:24%");
});

test("IconButton: P1-6 - className 含 pressed Accent 36% 描边混合", () => {
  render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  const cls = screen.getByTestId("b").className;
  assert.ok(cls.includes("active:[--border-mix:36%]"), "active 应设 --border-mix:36%");
});

test("IconButton: P1-6 - 默认 --border-mix=0%", () => {
  render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").style.getPropertyValue("--border-mix"), "0%");
});

test("IconButton: P1-6 - title 默认 = aria-label（tooltip）", () => {
  render(
    <IconButton aria-label="Close application" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").getAttribute("title"), "Close application");
});

test("IconButton: P1-6 - title 可显式覆盖", () => {
  render(
    <IconButton aria-label="close" title="关闭应用" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").getAttribute("title"), "关闭应用");
});

test("IconButton: aria-label 写入 button", () => {
  render(
    <IconButton aria-label="refresh data" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").getAttribute("aria-label"), "refresh data");
});

test("IconButton: type=button（避免表单提交）", () => {
  render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  assert.equal(screen.getByTestId("b").getAttribute("type"), "button");
});

test("IconButton: 内部 GlassSurface 是 absolute inset:0 + pointerEvents:none", () => {
  render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  const button = screen.getByTestId("b");
  // 第一个子元素是 GlassSurface 的 div（cast 到 HTMLElement 才能读 style）
  const glass = button.children[0] as HTMLElement;
  assert.ok(glass, "应有玻璃层");
  assert.equal(glass.style.position, "absolute");
  assert.equal(glass.style.inset, "0px");
  assert.equal(glass.style.pointerEvents, "none");
});

test("IconButton: 玻璃层 border 使用 color-mix（Accent 混合）", () => {
  render(
    <IconButton aria-label="x" data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  const glass = screen.getByTestId("b").children[0] as HTMLElement;
  assert.ok(glass.style.borderColor.includes("color-mix"));
  assert.ok(glass.style.borderColor.includes("var(--c-accent-start)"));
  assert.ok(glass.style.borderColor.includes("var(--c-border)"));
});

test("IconButton: disabled 时 opacity-55 class + cursor=default", () => {
  render(
    <IconButton aria-label="x" disabled data-testid="b">
      <span>x</span>
    </IconButton>,
  );
  const el = screen.getByTestId("b");
  assert.ok(el.className.includes("disabled:opacity-55"));
  assert.equal(el.style.cursor, "default");
});
