import React from "react";
/**
 * Layout primitives (Stack / Inline / Grid) 渲染测试。
 *
 * 验证 DESIGN_SYSTEM.md §8：gap 必须从 spacing token 解析，方向/对齐正确，
 * Grid columns 支持数字（→ repeat(n, 1fr)）和字符串。
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";
import { spacing } from "../../../renderer/src/styles/tokens";
import { Grid, Inline, Stack } from "../../../renderer/src/components/layout";

afterEach(cleanup);

test("Stack: flexDirection=column, gap 从 spacing token 解析", () => {
  render(
    <Stack gap="1_5" data-testid="s">
      <span>a</span>
      <span>b</span>
    </Stack>,
  );
  const el = screen.getByTestId("s");
  assert.equal(el.style.display, "flex");
  assert.equal(el.style.flexDirection, "column");
  assert.equal(el.style.gap, `${spacing["1_5"]}px`);
});

test("Stack: 未传 gap 时不设 gap 属性", () => {
  render(<Stack data-testid="s">x</Stack>);
  assert.equal(screen.getByTestId("s").style.gap, "");
});

test("Stack: align / justify 透传", () => {
  render(
    <Stack gap="1" align="center" justify="space-between" data-testid="s">
      x
    </Stack>,
  );
  const el = screen.getByTestId("s");
  assert.equal(el.style.alignItems, "center");
  assert.equal(el.style.justifyContent, "space-between");
  assert.equal(el.style.gap, `${spacing["1"]}px`);
});

test("Inline: flexDirection=row, 默认 nowrap", () => {
  render(
    <Inline gap="2" data-testid="i">
      x
    </Inline>,
  );
  const el = screen.getByTestId("i");
  assert.equal(el.style.flexDirection, "row");
  assert.equal(el.style.flexWrap, "nowrap");
  assert.equal(el.style.gap, `${spacing["2"]}px`);
});

test("Inline: wrap=true 时 flexWrap=wrap", () => {
  render(
    <Inline wrap data-testid="i">
      x
    </Inline>,
  );
  assert.equal(screen.getByTestId("i").style.flexWrap, "wrap");
});

test("Grid: columns=number → repeat(n, 1fr)", () => {
  render(
    <Grid columns={3} gap="1" data-testid="g">
      x
    </Grid>,
  );
  const el = screen.getByTestId("g");
  assert.equal(el.style.display, "grid");
  assert.equal(el.style.gridTemplateColumns, "repeat(3, 1fr)");
  assert.equal(el.style.gap, `${spacing["1"]}px`);
});

test("Grid: columns=string → 原样传入（surface 契约值白名单）", () => {
  render(
    <Grid columns="340px 20px 1px 20px 1fr" data-testid="g">
      x
    </Grid>,
  );
  assert.equal(screen.getByTestId("g").style.gridTemplateColumns, "340px 20px 1px 20px 1fr");
});

test("Grid: 未传 gap 时不设 gap 属性", () => {
  render(
    <Grid columns={2} data-testid="g">
      x
    </Grid>,
  );
  assert.equal(screen.getByTestId("g").style.gap, "");
});

test("Grid: align 透传", () => {
  render(
    <Grid columns={2} align="center" data-testid="g">
      x
    </Grid>,
  );
  assert.equal(screen.getByTestId("g").style.alignItems, "center");
});
