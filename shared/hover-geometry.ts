/**
 * hover-geometry — Orb/EdgeCapsule 命中区几何判断（纯函数，CI 可测）。
 *
 * 用于 D-3 切片 2 的 hover probe：主进程拿到光标屏幕坐标 + 窗口 DWM bounds + DPI 后，
 * 转成窗口局部 DIP 坐标，调这里的纯函数判断是否落在可见形状内。
 *
 * 为什么不能用 renderer mouseenter/mouseleave：Electron setIgnoreMouseEvents toggle
 * 会触发合成 enter/leave 死循环（issue #49982），forward:true 在其他 app 抢焦点时失效
 * （#33281）。照搬 WPF 的 probe 方案（GetCursorPos + DWM bounds + 几何判断）。
 *
 * 几何来源：
 * - Orb：窗口 82×136，visible=window（无偏移，Orb.tsx:49），radius.orb=41（tokens.ts:30）
 *   = 半宽，真竖向胶囊：上下半圆（r=41，圆心 y=41/95）+ 中间矩形条（y∈[41,95]，x∈[0,82]）
 * - EdgeCapsule：窗口 720×180，radius.capsuleLeft=28（tokens.ts:31）。整个 720×180 参与命中，
 *   仅排除左上/左下 28px 圆角外的透明角（visual-spec §8:283）
 */

/** Orb 窗口尺寸（= visible，Orb.tsx SURFACE_GEOMETRY.visible）。 */
const ORB_WIDTH = 82;
const ORB_HEIGHT = 136;
/** Orb 胶囊圆角半径 = 半宽（真竖向胶囊，radius.orb token）。 */
const ORB_RADIUS = 41;

/** EdgeCapsule 窗口尺寸（edge-capsule.ts spec）。 */
const CAPSULE_WIDTH = 720;
const CAPSULE_HEIGHT = 180;
/** EdgeCapsule 左圆角半径（radius.capsuleLeft token）。 */
const CAPSULE_LEFT_RADIUS = 28;

/**
 * 判断窗口局部 DIP 坐标 (x, y) 是否落在收起态 Orb 的可见胶囊形状内。
 *
 * @param x 光标相对于 Orb 窗口左上角的 X（DIP，已除以 DPI scale）
 * @param y 光标相对于 Orb 窗口左上角的 Y（DIP）
 * @returns true = 在胶囊内（应触发 hover）
 *
 * 几何（对齐 WPF Test-OrbPointerInVisibleShape，但 Electron visible=window 无偏移）：
 * - 越界（x<0 || x>82 || y<0 || y>136）→ false
 * - 中段矩形条（y∈[41,95]，整个宽度）→ true
 * - 上端半圆（y<41）：圆心 (41,41)，r=41，到圆心距离 ≤ 41 → true
 * - 下端半圆（y>95）：圆心 (41,95)，r=41，到圆心距离 ≤ 41 → true
 */
export function isPointInCollapsedOrb(x: number, y: number): boolean {
  if (x < 0 || x > ORB_WIDTH || y < 0 || y > ORB_HEIGHT) return false;
  // 中段矩形条：y 在两圆心之间。
  if (y >= ORB_RADIUS && y <= ORB_HEIGHT - ORB_RADIUS) return true;
  // 上端或下端半圆。
  const centerY = y < ORB_RADIUS ? ORB_RADIUS : ORB_HEIGHT - ORB_RADIUS;
  const dx = x - ORB_RADIUS;
  const dy = y - centerY;
  return dx * dx + dy * dy <= ORB_RADIUS * ORB_RADIUS;
}

/**
 * 判断窗口局部 DIP 坐标 (x, y) 是否落在展开态 EdgeCapsule 的命中区内。
 *
 * @param x 光标相对于 EdgeCapsule 窗口左上角的 X（DIP）
 * @param y 光标相对于 EdgeCapsule 窗口左上角的 Y（DIP）
 * @returns true = 在命中区（保持展开）
 *
 * 几何（visual-spec §8:283 + DEV-PLAN §5.4:152）：
 * - 整个 720×180 参与命中
 * - 仅排除左上/左下 28px 圆角外的透明角
 * - 即：x ≥ 28 → true（已过左圆角区）
 * - x < 28 但 y ∈ [28, 152]（中段，避开上下圆角区）→ true
 * - x < 28 且 y < 28 或 y > 152：到最近圆心 (28,28)/(28,152) 距离 ≤ 28 才算命中
 */
export function isPointInExpandedCapsule(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x > CAPSULE_WIDTH || y > CAPSULE_HEIGHT) return false;
  // 已过左圆角区，整个宽度都命中。
  if (x >= CAPSULE_LEFT_RADIUS) return true;
  // 左圆角区内但 y 在中段（避开上下圆角）→ 命中。
  if (y >= CAPSULE_LEFT_RADIUS && y <= CAPSULE_HEIGHT - CAPSULE_LEFT_RADIUS) return true;
  // 左上或左下圆角：到圆心距离 ≤ 28 才命中（圆角外的透明角排除）。
  const centerY =
    y < CAPSULE_LEFT_RADIUS ? CAPSULE_LEFT_RADIUS : CAPSULE_HEIGHT - CAPSULE_LEFT_RADIUS;
  const dx = x - CAPSULE_LEFT_RADIUS;
  const dy = y - centerY;
  return dx * dx + dy * dy <= CAPSULE_LEFT_RADIUS * CAPSULE_LEFT_RADIUS;
}

/** probe 输出的原始几何数据（主进程从 PowerShell 解析后传给判断函数）。 */
export interface ProbeGeometry {
  /** 光标屏幕 X（物理像素）。 */
  cursorX: number;
  /** 光标屏幕 Y（物理像素）。 */
  cursorY: number;
  /** 窗口 DWM bounds 左（物理像素）。 */
  windowLeft: number;
  /** 窗口 DWM bounds 上（物理像素）。 */
  windowTop: number;
  /** 窗口 DPI（96 基准）。 */
  dpi: number;
}

/**
 * 把 probe 原始几何 + surface kind 转成"光标是否在可见形状内"。
 * 主进程调用：拿到 ps1 的 raw 输出后，根据当前可见 surface 选判断函数。
 */
export function isPointerOverSurface(
  geometry: ProbeGeometry,
  kind: "orb" | "edge-capsule",
): boolean {
  const scale = geometry.dpi > 0 ? geometry.dpi / 96 : 1;
  // 局部 DIP 坐标 = (屏幕像素 - 窗口左上像素) / scale
  const localX = (geometry.cursorX - geometry.windowLeft) / scale;
  const localY = (geometry.cursorY - geometry.windowTop) / scale;
  return kind === "orb"
    ? isPointInCollapsedOrb(localX, localY)
    : isPointInExpandedCapsule(localX, localY);
}
