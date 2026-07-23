/**
 * hover-geometry 测试 — D-3 切片 2 的命中区几何判断（纯函数，CI 安全）。
 *
 * 覆盖五类输入（AGENTS.md 代码纪律 6）：中心 / 边缘 / 圆弧内 / 圆弧外透明角 / 越界。
 * 几何契约：Orb 82×136 真竖向胶囊（r=41）；EdgeCapsule 720×180 仅排除左 28px 圆角外透明角。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isPointInCollapsedOrb,
  isPointInExpandedCapsule,
  isPointerOverSurface,
} from "../../shared/hover-geometry";

// ─── 收起态 Orb（82×136，r=41 竖向胶囊）───

test("Orb: 中心点命中", () => {
  assert.equal(isPointInCollapsedOrb(41, 68), true, "几何中心");
  assert.equal(isPointInCollapsedOrb(0, 68), true, "中段左缘");
  assert.equal(isPointInCollapsedOrb(82, 68), true, "中段右缘");
});

test("Orb: 中段矩形条（y∈[41,95]）整个宽度命中", () => {
  assert.equal(isPointInCollapsedOrb(41, 41), true, "中段上界");
  assert.equal(isPointInCollapsedOrb(41, 95), true, "中段下界");
  assert.equal(isPointInCollapsedOrb(1, 68), true, "近左缘");
  assert.equal(isPointInCollapsedOrb(81, 68), true, "近右缘");
});

test("Orb: 上下端半圆命中（圆心 (41,41)/(41,95)，r=41）", () => {
  assert.equal(isPointInCollapsedOrb(41, 0), true, "顶端中点（圆心正上）");
  assert.equal(isPointInCollapsedOrb(41, 136), true, "底端中点（圆心正下）");
  assert.equal(isPointInCollapsedOrb(41, 20), true, "上半圆内");
  assert.equal(isPointInCollapsedOrb(41, 116), true, "下半圆内");
});

test("Orb: 圆角外透明角不命中", () => {
  // 左上角 (0,0)：到圆心 (41,41) 距离 ≈ 58 > 41
  assert.equal(isPointInCollapsedOrb(0, 0), false, "左上透明角");
  assert.equal(isPointInCollapsedOrb(82, 0), false, "右上透明角");
  assert.equal(isPointInCollapsedOrb(0, 136), false, "左下透明角");
  assert.equal(isPointInCollapsedOrb(82, 136), false, "右下透明角");
  assert.equal(isPointInCollapsedOrb(5, 5), false, "近左上圆角外");
});

test("Orb: 越界不命中", () => {
  assert.equal(isPointInCollapsedOrb(-1, 68), false, "x<0");
  assert.equal(isPointInCollapsedOrb(83, 68), false, "x>82");
  assert.equal(isPointInCollapsedOrb(41, -1), false, "y<0");
  assert.equal(isPointInCollapsedOrb(41, 137), false, "y>136");
});

// ─── 展开态 EdgeCapsule（720×180，左圆角 r=28）───

test("Capsule: 中心和右侧大片区域命中", () => {
  assert.equal(isPointInExpandedCapsule(360, 90), true, "中心");
  assert.equal(isPointInExpandedCapsule(719, 90), true, "右缘");
  assert.equal(isPointInExpandedCapsule(700, 0), true, "右上角（无右圆角排除）");
  assert.equal(isPointInExpandedCapsule(700, 180), true, "右下角");
});

test("Capsule: 左圆角区中段（x<28, y∈[28,152]）命中", () => {
  assert.equal(isPointInExpandedCapsule(0, 90), true, "左缘中点");
  assert.equal(isPointInExpandedCapsule(27, 28), true, "左圆角区上界");
  assert.equal(isPointInExpandedCapsule(27, 152), true, "左圆角区下界");
});

test("Capsule: 左上/左下圆角内命中（圆心 (28,28)/(28,152)，r=28）", () => {
  assert.equal(isPointInExpandedCapsule(28, 0), true, "左上圆心正上");
  assert.equal(isPointInExpandedCapsule(28, 180), true, "左下圆心正下");
  assert.equal(isPointInExpandedCapsule(28, 28), true, "左上圆心");
});

test("Capsule: 左上/左下圆角外透明角不命中", () => {
  assert.equal(isPointInExpandedCapsule(0, 0), false, "左上透明角");
  assert.equal(isPointInExpandedCapsule(0, 180), false, "左下透明角");
  assert.equal(isPointInExpandedCapsule(5, 5), false, "近左上圆角外");
  assert.equal(isPointInExpandedCapsule(5, 175), false, "近左下圆角外");
});

test("Capsule: 越界不命中", () => {
  assert.equal(isPointInExpandedCapsule(-1, 90), false, "x<0");
  assert.equal(isPointInExpandedCapsule(721, 90), false, "x>720");
  assert.equal(isPointInExpandedCapsule(360, -1), false, "y<0");
  assert.equal(isPointInExpandedCapsule(360, 181), false, "y>180");
});

// ─── isPointerOverSurface（DPI scale 转换 + 分发）───

test("isPointerOverSurface: DPI scale 正确转换", () => {
  // 150% DPI：光标在窗口左上角偏移 (41px, 68px) → 局部 (27.3, 45.3) DIP → Orb 中段 → true
  assert.equal(
    isPointerOverSurface(
      { cursorX: 41, cursorY: 68, windowLeft: 0, windowTop: 0, dpi: 144 },
      "orb",
    ),
    true,
    "150% DPI 中段",
  );
  // 100% DPI：光标在 Orb 几何中心 (41,68)px → 局部 (41,68) DIP → true
  assert.equal(
    isPointerOverSurface({ cursorX: 41, cursorY: 68, windowLeft: 0, windowTop: 0, dpi: 96 }, "orb"),
    true,
    "100% DPI 中心",
  );
  // 窗口有偏移：windowLeft=100，光标在 141 → 局部 41
  assert.equal(
    isPointerOverSurface(
      { cursorX: 141, cursorY: 168, windowLeft: 100, windowTop: 100, dpi: 96 },
      "orb",
    ),
    true,
    "窗口偏移 + 中心",
  );
});

test("isPointerOverSurface: dpi<=0 降级 scale=1（防御）", () => {
  assert.equal(
    isPointerOverSurface({ cursorX: 0, cursorY: 0, windowLeft: 0, windowTop: 0, dpi: 0 }, "orb"),
    false,
    "dpi=0 时左上角仍是透明角",
  );
});

test("isPointerOverSurface: capsule 分发正确", () => {
  assert.equal(
    isPointerOverSurface(
      { cursorX: 360, cursorY: 90, windowLeft: 0, windowTop: 0, dpi: 96 },
      "edge-capsule",
    ),
    true,
    "capsule 中心",
  );
  assert.equal(
    isPointerOverSurface(
      { cursorX: 0, cursorY: 0, windowLeft: 0, windowTop: 0, dpi: 96 },
      "edge-capsule",
    ),
    false,
    "capsule 左上透明角",
  );
});
