import React from "react";
/**
 * StatusLabel 渲染测试。
 *
 * 重点验证（P0/P1）：
 * - lineHeight 带 px 单位（防止无单位倍率导致 247px 行高）
 * - 状态点 + 文字双编码（无障碍）
 * - 4 种 status 各自颜色 token
 * - role=status（screen reader 可读）
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

afterEach(cleanup);
import {
  StatusLabel,
  type StatusKind,
} from "../../../renderer/src/components/foundations/StatusLabel";
import { typography } from "../../../renderer/src/styles/tokens";

test("StatusLabel: P0 - lineHeight 带 px 单位（caption token 19px，不是 19 倍）", () => {
  render(<StatusLabel status="low" label="偏低" data-testid="s" />);
  const el = screen.getByTestId("s");
  assert.equal(el.style.lineHeight, `${typography.caption.lineHeight}px`);
});

test("StatusLabel: fontSize 也带 px", () => {
  render(<StatusLabel status="low" label="偏低" data-testid="s" />);
  assert.equal(screen.getByTestId("s").style.fontSize, `${typography.caption.fontSize}px`);
});

test("StatusLabel: 4 种 status 各自颜色 token", () => {
  const cases: Array<{ status: StatusKind; expected: string }> = [
    { status: "sufficient", expected: "var(--c-success)" },
    { status: "low", expected: "var(--c-warning)" },
    { status: "critical", expected: "var(--c-danger)" },
    { status: "unavailable", expected: "var(--c-tertiary)" },
  ];
  for (const { status, expected } of cases) {
    const { unmount } = render(
      <StatusLabel status={status} label="x" data-testid={`s-${status}`} />,
    );
    const el = screen.getByTestId(`s-${status}`);
    // statusVariants cva 用 text-[var(--c-xxx)]，className 里应能找到对应 token
    assert.ok(el.className.includes(expected), `status=${status} 应含 ${expected}`);
    unmount();
  }
});

test("StatusLabel: 渲染状态点（圆，currentColor）+ 文字（双编码）", () => {
  render(<StatusLabel status="critical" label="紧张" data-testid="s" />);
  const el = screen.getByTestId("s");
  // 子元素：1 个点 span（aria-hidden）+ 1 个文字 span
  const dot = el.children[0] as HTMLElement;
  const text = el.children[1];
  assert.ok(dot, "应有状态点");
  assert.ok(text, "应有文字");
  assert.equal(dot.getAttribute("aria-hidden"), "true");
  assert.equal(text.textContent, "紧张");
  // 点是圆形
  assert.equal(dot.style.borderRadius, "50%");
  assert.equal(dot.style.backgroundColor.toLowerCase(), "currentcolor");
});

test("StatusLabel: role=status（screen reader 可读）", () => {
  render(<StatusLabel status="low" label="偏低" data-testid="s" />);
  assert.equal(screen.getByTestId("s").getAttribute("role"), "status");
});

test("StatusLabel: dotSize 控制点大小", () => {
  render(<StatusLabel status="low" label="x" dotSize={12} data-testid="s" />);
  const dot = screen.getByTestId("s").children[0] as HTMLElement;
  assert.equal(dot.style.width, "12px");
  assert.equal(dot.style.height, "12px");
});

test("StatusLabel: 默认 dotSize=8", () => {
  render(<StatusLabel status="low" label="x" data-testid="s" />);
  const dot = screen.getByTestId("s").children[0] as HTMLElement;
  assert.equal(dot.style.width, "8px");
});
