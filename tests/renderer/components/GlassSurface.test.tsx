import React from "react";
/**
 * GlassSurface 渲染测试。
 *
 * 重点验证（P0/P1 防回归）：
 * - surface 变体正确应用圆角 token
 * - 多层 aurora 渐变通过 background-image 注入
 * - border + box-shadow 存在
 * - children 正常渲染
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

afterEach(cleanup);
import { GlassSurface } from "../../../renderer/src/components/foundations/GlassSurface";
import { radius } from "../../../renderer/src/styles/tokens";

test("GlassSurface: 渲染 children", () => {
  render(
    <GlassSurface surface="card">
      <span>hello</span>
    </GlassSurface>,
  );
  assert.ok(screen.getByText("hello"));
});

test("GlassSurface: card 圆角 = radius.card (34px)", () => {
  render(<GlassSurface surface="card" data-testid="g" />);
  const el = screen.getByTestId("g");
  assert.equal(el.style.borderRadius, `${radius.card}px`);
});

test("GlassSurface: tray 圆角 = radius.tray (22px)", () => {
  render(<GlassSurface surface="tray" data-testid="g" />);
  assert.equal(screen.getByTestId("g").style.borderRadius, `${radius.tray}px`);
});

test("GlassSurface: bar/orb/capsule/button 各自圆角正确", () => {
  const { rerender } = render(<GlassSurface surface="bar" data-testid="g" />);
  assert.equal(screen.getByTestId("g").style.borderRadius, `${radius.bar}px`);
  rerender(<GlassSurface surface="orb" data-testid="g" />);
  assert.equal(screen.getByTestId("g").style.borderRadius, `${radius.orb}px`);
  rerender(<GlassSurface surface="capsule" data-testid="g" />);
  assert.equal(screen.getByTestId("g").style.borderRadius, `${radius.capsuleLeft}px`);
  rerender(<GlassSurface surface="button" data-testid="g" />);
  assert.equal(screen.getByTestId("g").style.borderRadius, `${radius.button36}px`);
});

test("GlassSurface: 主 surface 有 inset 双层边缘/环境光晕且无外部蓝影，button 保留轻阴影", () => {
  // 主 surface 不用 var(--shadow-card)，但必须保留 inset 材质定义。
  const { rerender } = render(<GlassSurface surface="card" data-testid="g" />);
  assert.ok(screen.getByTestId("g").style.boxShadow.includes("inset 0 1px 0"));
  assert.ok(screen.getByTestId("g").style.boxShadow.includes("inset 0 0 0 1px"));
  assert.ok(screen.getByTestId("g").style.boxShadow.includes("inset 0 0 32px"));
  assert.ok(!screen.getByTestId("g").style.boxShadow.includes("var(--shadow-card)"));
  rerender(<GlassSurface surface="capsule" data-testid="g" />);
  assert.ok(screen.getByTestId("g").style.boxShadow.includes("inset"));
  assert.ok(!screen.getByTestId("g").style.boxShadow.includes("var(--shadow-card)"));
  rerender(<GlassSurface surface="button" data-testid="g" />);
  assert.ok(screen.getByTestId("g").style.boxShadow.includes("inset"));
  assert.ok(screen.getByTestId("g").style.boxShadow.includes("var(--shadow-small)"));
});

test("GlassSurface: card 含 aurora 渐变（3 层 radial-gradient）", () => {
  render(<GlassSurface surface="card" data-testid="g" />);
  const bg = screen.getByTestId("g").style.backgroundImage;
  // 3 层 radial-gradient
  const count = (bg.match(/radial-gradient/g) || []).length;
  assert.equal(count, 3, `card 应有 3 层 aurora，实际 ${count}`);
});

test("GlassSurface: button 变体无 aurora（保持简洁）", () => {
  render(<GlassSurface surface="button" data-testid="g" />);
  const bg = screen.getByTestId("g").style.backgroundImage;
  assert.equal(bg, "none");
});

test("GlassSurface: border color 来自 token", () => {
  render(<GlassSurface surface="card" data-testid="g" />);
  assert.equal(screen.getByTestId("g").style.borderColor, "var(--c-border)");
});

test("GlassSurface: 默认 surface=card", () => {
  render(<GlassSurface data-testid="g" />);
  assert.equal(screen.getByTestId("g").style.borderRadius, `${radius.card}px`);
});
