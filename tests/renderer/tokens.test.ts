/**
 * tokens 一致性测试（纪律 E：期望值来自规格）。
 *
 * 读 docs/ui-designs/design-tokens.json，断言 renderer/src/styles/tokens.ts 导出的
 * 常量值与 JSON 完全一致。任何一方改动必须同步另一方，否则此测试失败。
 *
 * 这防止"token 改了 JSON 忘改 TS"或反向的漂移。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  motion,
  radius,
  ringAngles,
  ringGeometry,
  spacing,
  stroke,
  surfaceSizes,
  typography,
} from "../../renderer/src/styles/tokens.ts";

const tokensJson = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "..", "docs", "ui-designs", "design-tokens.json"),
    "utf8",
  ),
) as {
  spacing: Record<string, number>;
  radius: Record<string, number>;
  stroke: Record<string, number>;
  motion: {
    hoverExpandDelayMs: number;
    leaveCollapseDelayMs: number;
    expandCollapseDurationMs: number;
    easing: string;
  };
  typography: Record<
    string,
    { fontFamily: string; fontSize: number; lineHeight: number; fontWeight: number }
  >;
  size: {
    cardCodex: { width: number; height: number; visibleWidth: number; visibleHeight: number };
    cardZCode: { width: number; height: number; visibleWidth: number; visibleHeight: number };
    indicatorBar: { maxWidth: number; height: number };
    collapsedOrb: {
      windowWidth: number;
      windowHeight: number;
      visibleWidth: number;
      visibleHeight: number;
    };
    edgeCapsule: { width: number; height: number };
    iconButton: { card: number; bar: number };
    ring: Record<string, { frame: number; diameter: number; stroke: number; innerDisc: number }>;
  };
};

test("spacing 常量与 design-tokens.json 一致", () => {
  assert.equal(spacing["0_5"], tokensJson.spacing["0_5"]);
  assert.equal(spacing["1"], tokensJson.spacing["1"]);
  assert.equal(spacing["1_5"], tokensJson.spacing["1_5"]);
  assert.equal(spacing["2"], tokensJson.spacing["2"]);
  assert.equal(spacing["3"], tokensJson.spacing["3"]);
  assert.equal(spacing["4"], tokensJson.spacing["4"]);
});

test("radius 常量与 design-tokens.json 一致", () => {
  for (const key of Object.keys(tokensJson.radius) as Array<keyof typeof radius>) {
    assert.equal(
      radius[key],
      tokensJson.radius[key],
      `radius.${key} 漂移：tokens.ts=${radius[key]} vs JSON=${tokensJson.radius[key]}`,
    );
  }
});

test("stroke 常量与 design-tokens.json 一致", () => {
  assert.equal(stroke.surface, tokensJson.stroke.surface);
  assert.equal(stroke.icon, tokensJson.stroke.icon);
  assert.equal(stroke.focus, tokensJson.stroke.focus);
});

test("motion 常量与 design-tokens.json 一致", () => {
  assert.equal(motion.hoverExpandDelayMs, tokensJson.motion.hoverExpandDelayMs);
  assert.equal(motion.leaveCollapseDelayMs, tokensJson.motion.leaveCollapseDelayMs);
  assert.equal(motion.expandCollapseDurationMs, tokensJson.motion.expandCollapseDurationMs);
  assert.equal(motion.easing, tokensJson.motion.easing);
});

test("typography 每个 variant 与 design-tokens.json 一致", () => {
  for (const key of Object.keys(tokensJson.typography) as Array<keyof typeof typography>) {
    const expected = tokensJson.typography[key]!;
    const actual = typography[key];
    assert.equal(actual.fontFamily, expected.fontFamily, `typography.${key}.fontFamily 漂移`);
    assert.equal(actual.fontSize, expected.fontSize, `typography.${key}.fontSize 漂移`);
    assert.equal(actual.lineHeight, expected.lineHeight, `typography.${key}.lineHeight 漂移`);
    assert.equal(actual.fontWeight, expected.fontWeight, `typography.${key}.fontWeight 漂移`);
  }
});

test("ringGeometry 5 种尺寸与 design-tokens.json 一致（visual-spec §7）", () => {
  for (const key of Object.keys(tokensJson.size.ring) as Array<keyof typeof ringGeometry>) {
    const expected = tokensJson.size.ring[key]!;
    const actual = ringGeometry[key];
    assert.equal(actual.frame, expected.frame, `ring.${key}.frame 漂移`);
    assert.equal(actual.diameter, expected.diameter, `ring.${key}.diameter 漂移`);
    assert.equal(actual.stroke, expected.stroke, `ring.${key}.stroke 漂移`);
    assert.equal(actual.innerDisc, expected.innerDisc, `ring.${key}.innerDisc 漂移`);
  }
});

test("surfaceSizes 与 design-tokens.json 一致", () => {
  assert.deepEqual(surfaceSizes.cardCodex, tokensJson.size.cardCodex);
  assert.deepEqual(surfaceSizes.cardZCode, tokensJson.size.cardZCode);
  assert.deepEqual(surfaceSizes.indicatorBar, tokensJson.size.indicatorBar);
  assert.deepEqual(surfaceSizes.collapsedOrb, tokensJson.size.collapsedOrb);
  assert.deepEqual(surfaceSizes.edgeCapsule, tokensJson.size.edgeCapsule);
  assert.deepEqual(surfaceSizes.iconButton, tokensJson.size.iconButton);
});

test("ringAngles 安全缝在 visual-spec §7 规定的 0.5°–1° 范围", () => {
  // visual-spec §7："100% 时保留 0.5°–1° 的安全缝"
  assert.ok(
    ringAngles.fullCircleSafetyGap >= 0.5 && ringAngles.fullCircleSafetyGap <= 1,
    `安全缝 ${ringAngles.fullCircleSafetyGap}° 超出 0.5-1 范围`,
  );
});

test("ringAngles 刻度范围在 visual-spec §7 规定的 150°–245°", () => {
  assert.equal(ringAngles.tickRangeStart, 150);
  assert.equal(ringAngles.tickRangeEnd, 245);
  // visual-spec §7："8-10 个短刻度"
  assert.ok(
    ringAngles.tickCount >= 8 && ringAngles.tickCount <= 10,
    `刻度数 ${ringAngles.tickCount} 超出 8-10 范围`,
  );
});

test("typography 最小字号 >= 13px（visual-spec §1：可见文字不小于 13 DIP）", () => {
  for (const [name, token] of Object.entries(typography)) {
    assert.ok(
      token.fontSize >= 13,
      `typography.${name}.fontSize=${token.fontSize} < 13，违反 visual-spec §1`,
    );
  }
});
