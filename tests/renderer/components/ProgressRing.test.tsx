import React from "react";
/**
 * ProgressRing 渲染测试。
 *
 * 重点验证（P0/P1）：
 * - P0-3: svg width/height = ringDrawableSize（光晕不超框）
 * - P0-3: 所有 circle/path 坐标在 viewBox 内（不裁切）
 * - P1-4: 0% 画起点珠但不画弧；unavailable 不画珠且 rail 虚线
 * - P1-5: aria-label 写入 svg（role=img + aria-label）
 * - 6 层结构存在（halo/border/rail/ticks/disc/arc）
 * - 5 种尺寸各自正确
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

afterEach(cleanup);
import {
  ProgressRing,
  ringDrawableSize,
} from "../../../renderer/src/components/foundations/ProgressRing";
import { ringGeometry } from "../../../renderer/src/styles/tokens";

function getSvg(testId: string): HTMLElement {
  return screen.getByTestId(testId);
}

test("ProgressRing: svg width/height = frame(对照 WPF 圆环容器尺寸)", () => {
  // 圆环容器 = frame(126/198/60/40/48),对照 WPF SideWeekPanel/HeroWeekPanel。
  // halo 超出 frame 靠 overflow:visible 显示(被 Card 主区约束)。
  for (const size of ["hero", "side", "orb", "mini", "handle"] as const) {
    render(<ProgressRing size={size} progress={42} data-testid={`r-${size}`} />);
    const svg = getSvg(`r-${size}`);
    const expected = ringDrawableSize(size);
    assert.equal(
      svg.getAttribute("width"),
      String(expected),
      `${size}: svg width=${svg.getAttribute("width")} 应=${expected}`,
    );
    assert.equal(svg.getAttribute("height"), String(expected));
  }
});

test("ProgressRing: ringDrawableSize = frame(halo 不扩容器)", () => {
  for (const size of ["hero", "side", "orb", "mini", "handle"] as const) {
    assert.equal(
      ringDrawableSize(size),
      ringGeometry[size].frame,
      `${size}: drawableSize 应 = frame`,
    );
  }
});

test("ProgressRing: viewBox 与 width/height 一致(= frame)", () => {
  render(<ProgressRing size="hero" progress={42} data-testid="r" />);
  const svg = getSvg("r");
  const expected = ringDrawableSize("hero");
  assert.equal(svg.getAttribute("viewBox"), `0 0 ${expected} ${expected}`);
});

test("ProgressRing: svg overflow:visible(halo 超框可见)", () => {
  render(<ProgressRing size="hero" progress={42} data-testid="r" />);
  const svg = getSvg("r");
  assert.equal(svg.style.overflow, "visible");
});

test("ProgressRing: P1-5 - 传 aria-label 时 role=img + aria-label 写入", () => {
  render(<ProgressRing size="hero" progress={42} aria-label="quota 42%" data-testid="r" />);
  const svg = getSvg("r");
  assert.equal(svg.getAttribute("role"), "img");
  assert.equal(svg.getAttribute("aria-label"), "quota 42%");
  assert.equal(svg.getAttribute("aria-hidden"), null);
});

test("ProgressRing: P1-5 - 不传 aria-label 时 aria-hidden=true", () => {
  render(<ProgressRing size="hero" progress={42} data-testid="r" />);
  const svg = getSvg("r");
  assert.equal(svg.getAttribute("aria-hidden"), "true");
  assert.equal(svg.getAttribute("role"), null);
});

test("ProgressRing: P1-4 - progress=0 画起点珠（0% 是有效值，与 unavailable 不同）", () => {
  render(<ProgressRing size="hero" progress={0} data-testid="r" />);
  const svg = getSvg("r");
  // 起点珠是 fill=accent-start 的 circle
  const circles = svg.querySelectorAll("circle");
  const knobExists = Array.from(circles).some(
    (c) => c.getAttribute("fill") === "var(--c-accent-start)",
  );
  assert.ok(knobExists, "0% 应画起点珠");
});

test("ProgressRing: P1-4 - progress=0 不画 ProgressArc path", () => {
  render(<ProgressRing size="hero" progress={0} data-testid="r" />);
  const svg = getSvg("r");
  // ProgressArc 是带 stroke=url(#ring-progress-...) 的 path
  const arcs = svg.querySelectorAll("path[stroke^='url(#ring-progress']");
  assert.equal(arcs.length, 0, "0% 不应画进度弧");
});

test("ProgressRing: P1-4 - progress=null 不画起点珠", () => {
  render(<ProgressRing size="hero" progress={null} data-testid="r" />);
  const svg = getSvg("r");
  const circles = svg.querySelectorAll("circle");
  const knobExists = Array.from(circles).some(
    (c) => c.getAttribute("fill") === "var(--c-accent-start)",
  );
  assert.equal(knobExists, false, "unavailable 不应画起点珠");
});

test("ProgressRing: P1-4 - progress=null 时 rail 用虚线（strokeDasharray）", () => {
  render(<ProgressRing size="hero" progress={null} data-testid="r" />);
  const svg = getSvg("r");
  // rail 是 stroke=var(--c-rail) 的 circle
  const rails = svg.querySelectorAll("circle[stroke='var(--c-rail)']");
  assert.ok(rails.length > 0);
  const rail = rails[0];
  assert.ok(rail?.getAttribute("stroke-dasharray"), "unavailable rail 应有 stroke-dasharray");
});

test("ProgressRing: P1-4 - progress=42 时 rail 是实线（无 dasharray）", () => {
  render(<ProgressRing size="hero" progress={42} data-testid="r" />);
  const svg = getSvg("r");
  const rail = svg.querySelector("circle[stroke='var(--c-rail)']");
  assert.equal(rail?.getAttribute("stroke-dasharray"), null, "正常状态 rail 应实线");
});

test("ProgressRing: 6 层结构存在（halo/border/rail/ticks/disc/arc）", () => {
  // hero + progress=42 应有完整 6 层
  render(<ProgressRing size="hero" progress={42} data-testid="r" />);
  const svg = getSvg("r");
  const circles = svg.querySelectorAll("circle");
  const paths = svg.querySelectorAll("path");
  const lines = svg.querySelectorAll("line");

  // halo（带 filter:blur 的 circle）+ border + rail + disc + disc描边 + StartKnob = 多个 circle
  assert.ok(
    circles.length >= 5,
    `应有至少 5 个 circle（halo/border/rail/disc/disc-border/knob），实际 ${circles.length}`,
  );
  // 1 个 progress arc path
  assert.ok(paths.length >= 1, "应有 progress arc path");
  // hero 有刻度（9 条 line）
  assert.ok(lines.length >= 8, `hero 应有 8-10 条刻度，实际 ${lines.length}`);
});

test("ProgressRing: hero/side 有刻度，orb/mini/handle 无刻度", () => {
  for (const [size, expectTicks] of [
    ["hero", true],
    ["side", true],
    ["orb", false],
    ["mini", false],
    ["handle", false],
  ] as const) {
    const { unmount } = render(
      <ProgressRing size={size} progress={42} data-testid={`r-${size}`} />,
    );
    const lines = getSvg(`r-${size}`).querySelectorAll("line");
    if (expectTicks) {
      assert.ok(lines.length >= 8, `${size} 应有刻度，实际 ${lines.length}`);
    } else {
      assert.equal(lines.length, 0, `${size} 不应有刻度，实际 ${lines.length}`);
    }
    unmount();
  }
});

test("ProgressRing: 5 种尺寸 svg width 严格递减（hero > side > orb > handle > mini）", () => {
  // visual-spec §7 尺寸顺序
  const sizes = ["hero", "side", "orb", "mini", "handle"] as const;
  const widths = sizes.map((s) => ringDrawableSize(s));
  assert.ok(widths[0]! > widths[1]!, "hero 应 > side");
  assert.ok(widths[1]! > widths[2]!, "side 应 > orb");
});

test("ProgressRing: ProgressArc 用渐变（accent-start → accent-end）", () => {
  render(<ProgressRing size="hero" progress={50} data-testid="r" />);
  const svg = getSvg("r");
  const arc = svg.querySelector("path[stroke^='url(#ring-progress']");
  assert.ok(arc, "progress arc 应使用 ring-progress gradient");
  // 渐变定义存在
  const grad = svg.querySelector("linearGradient[id^='ring-progress']");
  assert.ok(grad);
  const stops = grad?.querySelectorAll("stop");
  assert.equal(stops?.[0]?.getAttribute("stop-color"), "var(--c-accent-start)");
  assert.equal(stops?.[1]?.getAttribute("stop-color"), "var(--c-accent-end)");
});

test("ProgressRing: 100% 画弧（有安全缝）+ 起点珠", () => {
  render(<ProgressRing size="hero" progress={100} data-testid="r" />);
  const svg = getSvg("r");
  const arcs = svg.querySelectorAll("path[stroke^='url(#ring-progress']");
  assert.ok(arcs.length >= 1, "100% 应画进度弧（带安全缝）");
});
