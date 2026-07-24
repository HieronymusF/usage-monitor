/** Milestone H 切片 3：窗口位置/显示器/吸附边纯函数测试。 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  anchorWindowToSource,
  captureWindowPlacement,
  createDefaultWindowPlacements,
  inferWindowSnapEdge,
  normalizeWindowPlacement,
  resolveWindowPlacement,
  validateWindowPlacements,
  type PlacementDisplay,
} from "../../shared/window-placement.js";

const primary: PlacementDisplay = {
  id: "1",
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
const leftSecondary: PlacementDisplay = {
  id: "2",
  workArea: { x: -1600, y: -120, width: 1600, height: 900 },
};

test("默认 map 明确覆盖四种 surface", () => {
  assert.deepEqual(createDefaultWindowPlacements(), {
    card: null,
    "indicator-bar": null,
    orb: null,
    "edge-capsule": null,
  });
});

test("单条 placement：正常值保留并取整；null/缺字段/非法边/非有限坐标拒绝", () => {
  assert.deepEqual(
    normalizeWindowPlacement({
      displayId: " 2 ",
      offsetX: 6.4,
      offsetY: 300.6,
      snapEdge: "left",
    }),
    { displayId: "2", offsetX: 6, offsetY: 301, snapEdge: "left" },
  );
  for (const invalid of [
    null,
    [],
    {},
    { displayId: "", offsetX: 1, offsetY: 2, snapEdge: null },
    { displayId: "1", offsetX: Number.NaN, offsetY: 2, snapEdge: null },
    { displayId: "1", offsetX: 1, offsetY: Number.POSITIVE_INFINITY, snapEdge: null },
    { displayId: "1", offsetX: 1, offsetY: 2, snapEdge: "top" },
  ]) {
    assert.equal(normalizeWindowPlacement(invalid), null);
  }
});

test("完整 map：单项损坏只清空该 surface，多余 key 被忽略", () => {
  const result = validateWindowPlacements({
    card: { displayId: "1", offsetX: 100, offsetY: 200, snapEdge: null },
    orb: { displayId: "2", offsetX: 6, offsetY: 300, snapEdge: "left" },
    "indicator-bar": { displayId: "1", offsetX: "bad", offsetY: 1, snapEdge: null },
    unexpected: { displayId: "1", offsetX: 1, offsetY: 1, snapEdge: null },
  });
  assert.deepEqual(result.card, {
    displayId: "1",
    offsetX: 100,
    offsetY: 200,
    snapEdge: null,
  });
  assert.deepEqual(result.orb, {
    displayId: "2",
    offsetX: 6,
    offsetY: 300,
    snapEdge: "left",
  });
  assert.equal(result["indicator-bar"], null);
  assert.equal(result["edge-capsule"], null);
  assert.equal((result as unknown as Record<string, unknown>).unexpected, undefined);
});

test("捕获副显示器负坐标时保存 workArea 相对 offset，不保存绝对坐标", () => {
  assert.deepEqual(
    captureWindowPlacement({ x: -1594, y: 80, width: 82, height: 136 }, leftSecondary, "left"),
    { displayId: "2", offsetX: 6, offsetY: 200, snapEdge: "left" },
  );
});

test("恢复自由位置：找到原显示器，重新加 workArea 起点并 clamp", () => {
  const result = resolveWindowPlacement(
    { displayId: "2", offsetX: 200, offsetY: 300, snapEdge: null },
    { width: 576, height: 404 },
    [primary, leftSecondary],
  );
  assert.deepEqual(result, { x: -1400, y: 180, displayId: "2" });
});

test("恢复吸附位置：分辨率变化后仍贴相同左/右边，Y 保持相对并 clamp", () => {
  assert.deepEqual(
    resolveWindowPlacement(
      { displayId: "1", offsetX: 999, offsetY: 2000, snapEdge: "right" },
      { width: 82, height: 136 },
      [primary],
    ),
    { x: 1832, y: 898, displayId: "1" },
  );
  assert.deepEqual(
    resolveWindowPlacement(
      { displayId: "2", offsetX: 999, offsetY: -999, snapEdge: "left" },
      { width: 720, height: 180 },
      [primary, leftSecondary],
    ),
    { x: -1594, y: -114, displayId: "2" },
  );
});

test("原显示器断开：回退 displays[0]（主屏）且保证窗口在 workArea 内", () => {
  const result = resolveWindowPlacement(
    { displayId: "missing", offsetX: 9000, offsetY: -500, snapEdge: null },
    { width: 576, height: 404 },
    [primary],
  );
  assert.deepEqual(result, { x: 1338, y: 6, displayId: "1" });
});

test("没有可用显示器时不猜位置", () => {
  assert.equal(
    resolveWindowPlacement(
      { displayId: "1", offsetX: 1, offsetY: 2, snapEdge: null },
      { width: 100, height: 100 },
      [],
    ),
    null,
  );
});

test("贴边推断允许 1 DIP DPI 取整误差，自由位置返回 null", () => {
  assert.equal(
    inferWindowSnapEdge({ x: 7, y: 100, width: 82, height: 136 }, primary.workArea),
    "left",
  );
  assert.equal(
    inferWindowSnapEdge({ x: 1831, y: 100, width: 82, height: 136 }, primary.workArea),
    "right",
  );
  assert.equal(
    inferWindowSnapEdge({ x: 400, y: 100, width: 82, height: 136 }, primary.workArea),
    null,
  );
});

test("Orb↔Capsule 锚点传递：右侧对齐右下角，左侧因 clamp 保持左边", () => {
  assert.deepEqual(
    anchorWindowToSource(
      { x: 1832, y: 800, width: 82, height: 136 },
      { width: 720, height: 180 },
      primary.workArea,
      "right",
    ),
    { x: 1194, y: 756 },
  );
  assert.deepEqual(
    anchorWindowToSource(
      { x: 6, y: 200, width: 82, height: 136 },
      { width: 720, height: 180 },
      primary.workArea,
      "left",
    ),
    { x: 6, y: 156 },
  );
  assert.deepEqual(
    anchorWindowToSource(
      { x: 6, y: 156, width: 720, height: 180 },
      { width: 82, height: 136 },
      primary.workArea,
      "left",
    ),
    { x: 6, y: 200 },
    "左侧 Capsule 收起后 Orb 仍贴左，不能按右下角跑到 x=644",
  );
});

test("窗口大于 workArea 时从 workArea 原点显示，不产生反向坐标", () => {
  assert.deepEqual(
    resolveWindowPlacement(
      { displayId: "1", offsetX: 30, offsetY: 40, snapEdge: null },
      { width: 3000, height: 2000 },
      [primary],
    ),
    { x: 0, y: 0, displayId: "1" },
  );
});
