/**
 * progress-ring-geometry — ProgressRing 的 SVG 几何纯函数。
 *
 * 视觉规格（visual-spec §7）：
 * - 0% 起点固定在 12 点方向，顺时针增长
 * - 进度弧：蓝→青渐变，圆头终点，起点带圆形珠
 * - 100% 时保留 0.5°–1° 安全缝
 * - 刻度：仅 hero/side 尺寸，左侧 150°–245° 范围，8–10 条
 *
 * SVG 角度约定（关键，易错）：
 * - SVG y 轴向下，数学坐标系 y 轴向上，所以角度方向相反
 * - 12 点钟 = 数学 90° = SVG -90°（或 270°）
 * - 顺时针在 SVG 里是角度递增（从 -90° 往 0°/90°/180° 走）
 *
 * 本模块所有函数纯无副作用，便于 node:test 测试。
 */

import { ringAngles, ringGeometry, type RingSize } from "../../styles/tokens";

/**
 * 把"从 12 点起顺时针的进度角度"转成 SVG 坐标系角度。
 * @param progressDegrees 0-360，0=12点，90=3点，180=6点
 * @returns SVG 坐标系角度（弧度），可直接用于 Math.cos/sin
 */
export function progressDegreesToSvgRadians(progressDegrees: number): number {
  // SVG: 12点 = -90°（即 -π/2），顺时针递增
  // progressDegrees 0 → svg -90°；90 → svg 0°；180 → svg 90°
  const svgDegrees = ringAngles.startAt12OClock + progressDegrees;
  return (svgDegrees * Math.PI) / 180;
}

/**
 * 计算圆上某点的 SVG 坐标。
 * @param centerX, centerY 圆心
 * @param radius 半径
 * @param progressDegrees 从 12 点起顺时针的角度
 */
export function pointOnCircle(
  centerX: number,
  centerY: number,
  radius: number,
  progressDegrees: number,
): { x: number; y: number } {
  const rad = progressDegreesToSvgRadians(progressDegrees);
  return {
    x: centerX + radius * Math.cos(rad),
    y: centerY + radius * Math.sin(rad),
  };
}

/**
 * 生成圆弧的 SVG path 描述符。
 *
 * 用 A（arc）命令。largeArcFlag：弧度 > 180° 时为 1。
 * sweepFlag：SVG 里 1 = 顺时针（与 progress 方向一致）。
 *
 * @param centerX, centerY 圆心
 * @param radius 半径（描边中心线）
 * @param startProgressDegrees 起点角度（从 12 点起顺时针）
 * @param endProgressDegrees 终点角度
 * @returns SVG path d 字符串，如 "M x y A r r 0 0 1 x y"
 */
export function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startProgressDegrees: number,
  endProgressDegrees: number,
): string {
  // 防御（纪律 F）：非法半径返回空 path
  if (radius <= 0 || !Number.isFinite(radius)) return "";
  // 角度归一化
  const start = clamp(startProgressDegrees, 0, 360);
  const end = clamp(endProgressDegrees, 0, 360);
  if (end <= start) return ""; // 0% 不画弧

  const startPt = pointOnCircle(centerX, centerY, radius, start);
  const endPt = pointOnCircle(centerX, centerY, radius, end);
  const sweep = end - start;
  const largeArcFlag = sweep > 180 ? 1 : 0;
  // sweepFlag=1 顺时针（SVG y 向下，progress 顺时针 = 角度递增）
  const sweepFlag = 1;

  return `M ${startPt.x.toFixed(3)} ${startPt.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endPt.x.toFixed(3)} ${endPt.y.toFixed(3)}`;
}

/**
 * 把 progress 百分比（0-100）转成"应画到多少度"。
 * 100% 时保留安全缝（visual-spec §7：0.5°–1°），避免圆头重叠。
 *
 * @param progress 0-100（越界自动截断）；null = unavailable，返回 0
 * @returns 终点角度（0-360），0% 返回 0（不画弧）
 */
export function progressToDegrees(progress: number | null): number {
  if (progress === null || !Number.isFinite(progress)) return 0;
  const clamped = clamp(progress, 0, 100);
  if (clamped <= 0) return 0;
  if (clamped >= 100) return 360 - ringAngles.fullCircleSafetyGap; // 100% 留安全缝
  return (clamped / 100) * 360;
}

/**
 * 计算 hero/side 尺寸的刻度位置。
 * 刻度在圆环左侧 150°–245° 范围（visual-spec §7）。
 * 每条刻度朝向圆心。
 *
 * @param centerX, centerY 圆心
 * @param outerRadius 刻度外端半径（轨道外缘）
 * @param tickLength 刻度长度（8-12px，visual-spec §7）
 * @returns 每条刻度的 {x1,y1,x2,y2}（外端→内端）
 */
export function tickPositions(
  centerX: number,
  centerY: number,
  outerRadius: number,
  tickLength = 10,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const { tickRangeStart, tickRangeEnd, tickCount } = ringAngles;
  const innerRadius = outerRadius - tickLength;
  const ticks: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  // tickCount 个刻度均匀分布在 [tickRangeStart, tickRangeEnd]
  const step = tickCount > 1 ? (tickRangeEnd - tickRangeStart) / (tickCount - 1) : 0;
  for (let i = 0; i < tickCount; i++) {
    const angle = tickRangeStart + step * i;
    const outer = pointOnCircle(centerX, centerY, outerRadius, angle);
    const inner = pointOnCircle(centerX, centerY, innerRadius, angle);
    ticks.push({ x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y });
  }
  return ticks;
}

/**
 * 取指定尺寸的圆环布局（frame/diameter/stroke/innerDisc）。
 * 来自 design-tokens §size.ring。
 */
export function ringLayout(size: RingSize) {
  return ringGeometry[size];
}

/**
 * 计算圆环中心点（frame 的几何中心）。
 * 所有层共用同一中心（visual-spec §7：必须共用同一几何中心）。
 */
export function ringCenter(size: RingSize): { cx: number; cy: number } {
  const { frame } = ringLayout(size);
  return { cx: frame / 2, cy: frame / 2 };
}

/** 数值钳制（纪律 F：防御越界）。 */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
