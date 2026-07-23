/**
 * orb-drag 测试 — D-3 切片 3 的拖动判定 + 贴边吸附（纯函数，CI 安全）。
 *
 * 覆盖五类输入（AGENTS.md 代码纪律 6）。
 * 契约：shouldStartDrag 阈值 6 DIP（PRD §6.5，逐轴 max 判定对齐 WPF）；
 * snapOrbToEdge 对齐 WPF Snap-OrbToNearestEdge（Y clamp + 水平中心选左/右）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shouldStartDrag, snapOrbToEdge } from "../../shared/orb-drag";

// ─── shouldStartDrag（6 DIP 阈值，逐轴 max 判定）───

test("shouldStartDrag: 零位移不是拖动", () => {
  assert.equal(shouldStartDrag(0, 0), false, "完全不动 = click");
});

test("shouldStartDrag: 边界值（默认阈值 6）", () => {
  assert.equal(shouldStartDrag(6, 0), false, "=6 不超（严格大于）");
  assert.equal(shouldStartDrag(6.1, 0), true, ">6 触发");
  assert.equal(shouldStartDrag(0, 5.9), false, "Y 轴 5.9 不超");
  assert.equal(shouldStartDrag(0, 6.1), true, "Y 轴 >6 触发");
});

test("shouldStartDrag: 大值 / 负值 / 对角线", () => {
  assert.equal(shouldStartDrag(100, 0), true, "大位移 X");
  assert.equal(shouldStartDrag(0, -50), true, "负向 Y（abs）");
  assert.equal(shouldStartDrag(-7, -7), true, "对角线负向（max=7>6）");
  assert.equal(shouldStartDrag(4, 4), false, "对角线小位移（max=4<=6，hypot≈5.66 但逐轴不超）");
});

test("shouldStartDrag: 自定义阈值", () => {
  assert.equal(shouldStartDrag(3, 0, 2), true, "阈值 2，位移 3 触发");
  assert.equal(shouldStartDrag(1, 1, 2), false, "阈值 2，位移 1 不触发");
});

// ─── snapOrbToEdge（Y clamp + 水平中心选左/右）───
// 用 1920×1080 workArea（x=0,y=0,w=1920,h=1080），margin=6，Orb 82×136。

const WORKAREA = { x: 0, y: 0, width: 1920, height: 1080 };
const ORB_BOUNDS = (x: number, y: number) => ({ x, y, width: 82, height: 136 });

test("snapOrbToEdge: 窗口在左半 → 贴左", () => {
  // 中心 x=100 < workArea 中心 960
  const result = snapOrbToEdge(ORB_BOUNDS(59, 500), WORKAREA);
  assert.equal(result.x, 6, "贴左 x = workArea.x + margin = 6");
  assert.equal(result.y, 500, "Y 在范围内不变");
});

test("snapOrbToEdge: 窗口在右半 → 贴右", () => {
  // 中心 x=1800 > 960
  const result = snapOrbToEdge(ORB_BOUNDS(1759, 500), WORKAREA);
  assert.equal(
    result.x,
    1920 - 82 - 6,
    "贴右 x = workArea.x + width - bounds.width - margin = 1832",
  );
  assert.equal(result.y, 500, "Y 在范围内不变");
});

test("snapOrbToEdge: 水平中心正好在 workArea 中心 → 贴右（>= 不触发左）", () => {
  // 中心 x=960 == workArea 中心 960 → 不小于 → 贴右
  const result = snapOrbToEdge(ORB_BOUNDS(919, 500), WORKAREA);
  assert.equal(result.x, 1832, "中心等于 workArea 中心时贴右");
});

test("snapOrbToEdge: Y 超上界 → clamp 到顶部", () => {
  const result = snapOrbToEdge(ORB_BOUNDS(100, -50), WORKAREA);
  assert.equal(result.y, 6, "Y clamp 到 workArea.y + margin");
});

test("snapOrbToEdge: Y 超下界 → clamp 到底部", () => {
  const result = snapOrbToEdge(ORB_BOUNDS(100, 2000), WORKAREA);
  assert.equal(result.y, 1080 - 136 - 6, "Y clamp 到 workArea.y + height - bounds.height - margin");
});

test("snapOrbToEdge: 自定义边距", () => {
  const result = snapOrbToEdge(ORB_BOUNDS(59, 0), WORKAREA, 10);
  assert.equal(result.x, 10, "贴左 margin=10");
  assert.equal(result.y, 10, "Y clamp margin=10");
});

test("snapOrbToEdge: workArea 有偏移（副显示器）", () => {
  // 副显示器 workArea 起点非 0
  const secondary = { x: 1920, y: 0, width: 1920, height: 1080 };
  const result = snapOrbToEdge(ORB_BOUNDS(2000, 500), secondary);
  assert.equal(result.x, 1920 + 6, "副屏贴左 = secondary.x + margin");
  assert.equal(result.y, 500, "Y 不变");
});
