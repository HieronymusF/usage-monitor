import React from "react";
/**
 * MetricValue 渲染测试。
 *
 * 重点验证（P0/P1）：
 * - lineHeight 带 px 单位（60px 数字不能变 3840px 行高）
 * - fontSize 带 px
 * - 单位字号 = 主数值的 51%（%）/ 54%（其他）
 * - tabular-nums + lining-nums 启用
 * - label 用 caption 样式 + tertiary 色
 * - 缺失 unit 时不渲染单位 span
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

afterEach(cleanup);
import { MetricValue } from "../../../renderer/src/components/foundations/MetricValue";
import { typography } from "../../../renderer/src/styles/tokens";

test("MetricValue: P0 - displayL lineHeight = 64px（不是 64 倍）", () => {
  render(<MetricValue value="42" variant="displayL" data-testid="m" />);
  const el = screen.getByTestId("m");
  // displayL 的 lineHeight=64。主数值 span 是第二个子元素（label 在前，如有）
  const numberSpan = (el.querySelector("span > span") as HTMLElement) ?? el.children[0];
  assert.equal(numberSpan.style.lineHeight, `${typography.displayL.lineHeight}px`);
});

test("MetricValue: fontSize 带 px（displayL = 60px）", () => {
  render(<MetricValue value="42" variant="displayL" data-testid="m" />);
  const numberSpan = screen.getByTestId("m").querySelector("span > span") as HTMLElement;
  assert.equal(numberSpan?.style.fontSize, `${typography.displayL.fontSize}px`);
});

test("MetricValue: 默认 variant=metricM (22/28)", () => {
  render(<MetricValue value="100" data-testid="m" />);
  const numberSpan = screen.getByTestId("m").querySelector("span > span") as HTMLElement;
  assert.equal(numberSpan?.style.fontSize, `${typography.metricM.fontSize}px`);
  assert.equal(numberSpan?.style.lineHeight, `${typography.metricM.lineHeight}px`);
});

test("MetricValue: 启用 tabular-nums + lining-nums", () => {
  render(<MetricValue value="42" data-testid="m" />);
  const numberSpan = screen.getByTestId("m").querySelector("span > span") as HTMLElement;
  assert.equal(numberSpan?.style.fontVariantNumeric, "tabular-nums lining-nums");
});

test("MetricValue: % 单位字号 = 主数值 51%", () => {
  render(<MetricValue value="42" unit="%" variant="displayL" data-testid="m" />);
  // displayL fontSize=60，51% = 30.6 → round = 31
  const expectedUnit = Math.round(typography.displayL.fontSize * 0.51);
  const unitSpan = screen
    .getByTestId("m")
    .querySelector("span > span > span:last-child") as HTMLElement;
  assert.equal(unitSpan?.style.fontSize, `${expectedUnit}px`);
});

test("MetricValue: M 单位字号 = 主数值 54%", () => {
  render(<MetricValue value="1.65" unit="M" variant="metricM" data-testid="m" />);
  // metricM fontSize=22，54% = 11.88 → round = 12
  const expectedUnit = Math.round(typography.metricM.fontSize * 0.54);
  const unitSpan = screen
    .getByTestId("m")
    .querySelector("span > span > span:last-child") as HTMLElement;
  assert.equal(unitSpan?.style.fontSize, `${expectedUnit}px`);
});

test("MetricValue: 无 unit 时不渲染单位 span", () => {
  render(<MetricValue value="42" data-testid="m" />);
  const numberSpan = screen.getByTestId("m").querySelector("span > span") as HTMLElement;
  // 只有 value span，没有 unit span
  assert.equal(numberSpan?.children.length, 1);
  assert.equal(numberSpan?.children[0]?.textContent, "42");
});

test("MetricValue: label 用 caption 样式 + tertiary 色", () => {
  render(<MetricValue value="42" label="剩余" data-testid="m" />);
  const labelSpan = screen.getByTestId("m").children[0] as HTMLElement;
  assert.equal(labelSpan.style.fontSize, `${typography.caption.fontSize}px`);
  assert.equal(labelSpan.style.lineHeight, `${typography.caption.lineHeight}px`);
  assert.equal(labelSpan.style.color, "var(--c-tertiary)");
  assert.equal(labelSpan.textContent, "剩余");
});

test("MetricValue: color 默认 ink，可覆盖", () => {
  const { rerender } = render(<MetricValue value="42" data-testid="m" />);
  assert.equal(screen.getByTestId("m").style.color, "var(--c-ink)");
  rerender(<MetricValue value="42" color="var(--c-success)" data-testid="m" />);
  assert.equal(screen.getByTestId("m").style.color, "var(--c-success)");
});

test("MetricValue: value 文本正确渲染", () => {
  render(<MetricValue value="1.65M" unit="tokens" data-testid="m" />);
  assert.ok(screen.getByText("1.65M"));
});
