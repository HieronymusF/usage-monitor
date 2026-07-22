/**
 * progress-ring-geometry 单元测试。
 *
 * 纪律 E：期望值来自 visual-spec §7（不是实现）。
 * 纪律 F：覆盖 5 类输入：null/0/边界(20/50)/100/超范围。
 *
 * 关键几何断言（visual-spec §7）：
 * - 0% 起点 12 点：SVG 坐标 (cx, cy-radius)
 * - 42% 终点约在 5 点方向：终点 y > cy（SVG y 向下，5 点在下方）
 * - 100% 保留 0.5°-1° 安全缝（不画完整 360°）
 * - progress=null → 0 度（不画弧）
 * - 越界值（-10, 150）截断到 [0, 100]
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  describeArc,
  pointOnCircle,
  progressDegreesToSvgRadians,
  progressToDegrees,
  ringCenter,
  ringLayout,
  tickPositions,
} from "../../renderer/src/components/foundations/progress-ring-geometry.ts";
import { ringGeometry } from "../../renderer/src/styles/tokens.ts";

// 测试基准：hero 尺寸，中心 (99, 99)，半径 95（diameter 190 / 2）
const HERO = ringGeometry.hero;
const CX = HERO.frame / 2; // 99
const CY = HERO.frame / 2; // 99
const R = HERO.diameter / 2; // 95

// ---------- progressToDegrees（5 类输入）----------

test("progressToDegrees: null → 0（unavailable，不画弧）", () => {
  assert.equal(progressToDegrees(null), 0);
});

test("progressToDegrees: NaN / Infinity → 0（防御）", () => {
  assert.equal(progressToDegrees(Number.NaN), 0);
  assert.equal(progressToDegrees(Number.POSITIVE_INFINITY), 0);
});

test("progressToDegrees: 0 → 0", () => {
  assert.equal(progressToDegrees(0), 0);
});

test("progressToDegrees: 负值 → 0（截断）", () => {
  assert.equal(progressToDegrees(-10), 0);
});

test("progressToDegrees: 50 → 180（半圆）", () => {
  assert.equal(progressToDegrees(50), 180);
});

test("progressToDegrees: 25 → 90（四分之一）", () => {
  assert.equal(progressToDegrees(25), 90);
});

test("progressToDegrees: 100 → 360 - 安全缝（不画完整圆）", () => {
  const degrees = progressToDegrees(100);
  assert.ok(degrees < 360, "100% 不能画完整 360°，必须留安全缝");
  assert.ok(degrees >= 359, `100% 安全缝过大：${360 - degrees}°（应 0.5-1°）`);
});

test("progressToDegrees: >100 → 截断到 100% 处理（同样留安全缝）", () => {
  const over = progressToDegrees(150);
  const exact100 = progressToDegrees(100);
  assert.equal(over, exact100, "超过 100 应截断到 100% 的安全缝值");
});

// ---------- describeArc 几何正确性 ----------

test("describeArc: 非法半径 → 空字符串（防御，纪律 F）", () => {
  assert.equal(describeArc(99, 99, 0, 0, 90), "");
  assert.equal(describeArc(99, 99, -5, 0, 90), "");
  assert.equal(describeArc(99, 99, Number.NaN, 0, 90), "");
});

test("describeArc: 0% → 空字符串（不画弧）", () => {
  assert.equal(describeArc(CX, CY, R, 0, 0), "");
});

test("describeArc: end <= start → 空字符串", () => {
  assert.equal(describeArc(CX, CY, R, 90, 90), "");
  assert.equal(describeArc(CX, CY, R, 180, 90), "");
});

test("describeArc: 正常弧以 M (moveTo) 和 A (arc) 命令开头", () => {
  const path = describeArc(CX, CY, R, 0, 90);
  assert.match(path, /^M [\d.-]+ [\d.-]+ A /);
});

test("describeArc: 0%-50% 起点在 12 点（SVG 坐标 x=cx, y=cy-r）", () => {
  // 0% 起点 = 12 点 = SVG (cx, cy-radius)
  const path = describeArc(CX, CY, R, 0, 180);
  // M 命令后的坐标应该是起点 (99, 4)
  const match = path.match(/^M ([\d.-]+) ([\d.-]+)/);
  assert.ok(match);
  const startX = Number.parseFloat(match[1]!);
  const startY = Number.parseFloat(match[2]!);
  assert.ok(Math.abs(startX - CX) < 0.01, `起点 x 应=${CX}，实际=${startX}`);
  assert.ok(Math.abs(startY - (CY - R)) < 0.01, `起点 y 应=${CY - R}（12点），实际=${startY}`);
});

test("describeArc: 42% 终点约在 5 点方向（y > cy，即下半部）", () => {
  // visual-spec §7：42% 视觉参考——终点约在 5 点方向
  const endDegrees = progressToDegrees(42); // 151.2°
  const path = describeArc(CX, CY, R, 0, endDegrees);
  // A 命令最后的坐标是终点
  const match = path.match(/A [\d.]+ [\d.]+ 0 [01] 1 ([\d.-]+) ([\d.-]+)$/);
  assert.ok(match, `path 不符合预期格式: ${path}`);
  const endX = Number.parseFloat(match[1]!);
  const endY = Number.parseFloat(match[2]!);
  // 5 点方向：x 略大于 cx（右侧），y 明显大于 cy（下半部）
  assert.ok(endX > CX, `42% 终点 x=${endX} 应 > cx=${CX}（5 点在右侧）`);
  assert.ok(endY > CY, `42% 终点 y=${endY} 应 > cy=${CY}（5 点在下半部）`);
});

test("describeArc: sweep > 180° 时 largeArcFlag=1", () => {
  // 0%→75% = 270°，超过 180°，largeArcFlag 应为 1
  const path = describeArc(CX, CY, R, 0, progressToDegrees(75));
  // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  assert.match(path, /A [\d.]+ [\d.]+ 0 1 1 /);
});

test("describeArc: sweep <= 180° 时 largeArcFlag=0", () => {
  // 0%→25% = 90°，小于 180°
  const path = describeArc(CX, CY, R, 0, progressToDegrees(25));
  assert.match(path, /A [\d.]+ [\d.]+ 0 0 1 /);
});

// ---------- pointOnCircle 角度方向 ----------

test("pointOnCircle: 0° = 12 点（顶部）", () => {
  const p = pointOnCircle(CX, CY, R, 0);
  assert.ok(Math.abs(p.x - CX) < 0.01);
  assert.ok(Math.abs(p.y - (CY - R)) < 0.01);
});

test("pointOnCircle: 90° = 3 点（右侧）", () => {
  const p = pointOnCircle(CX, CY, R, 90);
  assert.ok(Math.abs(p.x - (CX + R)) < 0.01);
  assert.ok(Math.abs(p.y - CY) < 0.01);
});

test("pointOnCircle: 180° = 6 点（底部）", () => {
  const p = pointOnCircle(CX, CY, R, 180);
  assert.ok(Math.abs(p.x - CX) < 0.01);
  assert.ok(Math.abs(p.y - (CY + R)) < 0.01);
});

test("pointOnCircle: 270° = 9 点（左侧）", () => {
  const p = pointOnCircle(CX, CY, R, 270);
  assert.ok(Math.abs(p.x - (CX - R)) < 0.01);
  assert.ok(Math.abs(p.y - CY) < 0.01);
});

// ---------- ringLayout / ringCenter ----------

test("ringLayout: 返回值与 ringGeometry 一致（防漂移）", () => {
  for (const size of ["hero", "side", "orb", "mini", "handle"] as const) {
    assert.deepEqual(ringLayout(size), ringGeometry[size]);
  }
});

test("ringCenter: 是 frame 的几何中心", () => {
  for (const size of ["hero", "side", "orb", "mini", "handle"] as const) {
    const { cx, cy } = ringCenter(size);
    const { frame } = ringGeometry[size];
    assert.equal(cx, frame / 2);
    assert.equal(cy, frame / 2);
  }
});

// ---------- tickPositions ----------

test("tickPositions: 数量 = ringAngles.tickCount（visual-spec §7：8-10 条）", () => {
  const ticks = tickPositions(CX, CY, R + 4, 10);
  assert.ok(ticks.length >= 8 && ticks.length <= 10, `刻度数 ${ticks.length} 超出 8-10`);
});

test("tickPositions: 每条刻度长度 = tickLength 参数", () => {
  const ticks = tickPositions(CX, CY, R + 4, 10);
  for (const t of ticks) {
    const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
    assert.ok(Math.abs(len - 10) < 0.01, `刻度长度 ${len} ≠ 10`);
  }
});

test("tickPositions: 刻度在圆环下半部左弧段（visual-spec §7 左侧 150°-245°）", () => {
  // visual-spec §7："仅显示在圆环左侧，不围满整圈"，范围 150°-245°。
  // 在进度角度系（0=12点顺时针）下，150° ≈ 5 点（右下）、245° ≈ 8 点（左下），
  // 所以这个弧段横跨圆的下半部（y > cy），从右下经 6 点到左下。
  const ticks = tickPositions(CX, CY, R + 4, 10);
  for (const t of ticks) {
    // 下半部：y > cy（SVG y 向下）
    assert.ok(t.y1 > CY, `刻度外端 y=${t.y1} 应 > cy=${CY}（下半部）`);
    assert.ok(t.y2 > CY, `刻度内端 y=${t.y2} 应 > cy=${CY}（下半部）`);
  }
});

test("tickPositions: mini/handle 尺寸不应有刻度（由组件层控制，这里测函数本身仍可调用）", () => {
  // 函数本身不区分尺寸；是否画刻度由 ProgressRing 组件的 showTicks 控制。
  // 这里验证函数对任意输入都不崩溃。
  const ticks = tickPositions(20, 20, 15, 8);
  assert.equal(ticks.length, 9); // ringAngles.tickCount = 9
});

// ---------- progressDegreesToSvgRadians（核心角度转换）----------

test("progressDegreesToSvgRadians: 0° (12点) 对应 SVG -π/2", () => {
  const rad = progressDegreesToSvgRadians(0);
  assert.ok(Math.abs(rad - -Math.PI / 2) < 0.001);
});

test("progressDegreesToSvgRadians: 90° (3点) 对应 SVG 0", () => {
  const rad = progressDegreesToSvgRadians(90);
  assert.ok(Math.abs(rad - 0) < 0.001);
});
