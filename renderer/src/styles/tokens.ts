/**
 * Design tokens — 尺寸/字号/几何常量（typed）。
 *
 * 颜色不在这里（颜色是 CSS variable，见 globals.css）。这里只导出
 * 组件需要的数字常量：间距、圆角、描边、字号、圆环几何、窗口尺寸。
 *
 * 所有值逐字来自 docs/ui-designs/design-tokens.json，每个常量旁标注 JSON 行号。
 * tokens.test.ts 断言这里的值与 JSON 一致（防漂移，纪律 E）。
 *
 * ⚠️ 改这里的值必须同时改 design-tokens.json，否则 tokens.test.ts 失败。
 */

// design-tokens.json §spacing (行 40-47)
export const spacing = {
  "0_5": 4,
  "1": 8,
  "1_5": 12,
  "2": 16,
  "3": 24,
  "4": 32,
} as const;
/** Spacing token key —— 用于 layout 原语 gap/spacing 引用，杜绝裸数字。 */
export type Spacing = keyof typeof spacing;

// design-tokens.json §radius (行 48-56)
export const radius = {
  card: 34,
  tray: 22,
  bar: 9,
  orb: 41,
  capsuleLeft: 28,
  button40: 20,
  button36: 18,
  button30: 15,
} as const;
export type Radius = typeof radius;

// design-tokens.json §stroke (行 183-187)
export const stroke = {
  surface: 1,
  icon: 1.333,
  focus: 2,
} as const;
export type Stroke = typeof stroke;

// design-tokens.json §motion (行 188-193)
export const motion = {
  hoverExpandDelayMs: 220,
  leaveCollapseDelayMs: 420,
  expandCollapseDurationMs: 180,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;
export type Motion = typeof motion;

// design-tokens.json §typography (行 121-182)
export interface TypographyToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
}

export const typography = {
  displayXL: {
    fontFamily: "Segoe UI Variable Display",
    fontSize: 92,
    lineHeight: 96,
    fontWeight: 700,
  },
  displayL: {
    fontFamily: "Segoe UI Variable Display",
    fontSize: 60,
    lineHeight: 64,
    fontWeight: 700,
  },
  displayM: {
    fontFamily: "Segoe UI Variable Display",
    fontSize: 42,
    lineHeight: 48,
    fontWeight: 700,
  },
  displayS: {
    fontFamily: "Segoe UI Variable Display",
    fontSize: 34,
    lineHeight: 42,
    fontWeight: 700,
  },
  metricL: {
    fontFamily: "Segoe UI Variable Display",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: 600,
  },
  metricM: {
    fontFamily: "Segoe UI Variable Display",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 600,
  },
  labelL: { fontFamily: "Segoe UI Variable Text", fontSize: 16, lineHeight: 24, fontWeight: 600 },
  body: { fontFamily: "Segoe UI Variable Text", fontSize: 14, lineHeight: 20, fontWeight: 400 },
  caption: { fontFamily: "Segoe UI Variable Text", fontSize: 13, lineHeight: 19, fontWeight: 400 },
  bar: { fontFamily: "Segoe UI Variable Text", fontSize: 14, lineHeight: 20, fontWeight: 400 },
} as const satisfies Record<string, TypographyToken>;

export type TypographyVariant = keyof typeof typography;

// design-tokens.json §size.ring (行 88-119)
// 每种尺寸的组件框/轨道直径/描边宽度/内盘直径。visual-spec §7 几何表权威。
export interface RingGeometry {
  /** SVG viewBox 边长（组件框）。 */
  frame: number;
  /** 进度弧 + 轨道的直径（描边中心线）。 */
  diameter: number;
  /** 描边宽度。 */
  stroke: number;
  /** 内层玻璃圆盘直径。 */
  innerDisc: number;
}

export const ringGeometry = {
  hero: { frame: 198, diameter: 190, stroke: 8, innerDisc: 156 },
  side: { frame: 126, diameter: 118, stroke: 7, innerDisc: 98 },
  orb: { frame: 62, diameter: 56, stroke: 5, innerDisc: 43 },
  mini: { frame: 40, diameter: 34, stroke: 4, innerDisc: 26 },
  handle: { frame: 48, diameter: 42, stroke: 4, innerDisc: 32 },
} as const satisfies Record<RingSize, RingGeometry>;

export type RingSize = "hero" | "side" | "orb" | "mini" | "handle";

// design-tokens.json §size (行 57-87) — 各 surface 窗口尺寸
export const surfaceSizes = {
  cardCodex: { width: 576, height: 404, visibleWidth: 560, visibleHeight: 388 },
  cardZCode: { width: 576, height: 333, visibleWidth: 560, visibleHeight: 317 },
  indicatorBar: { maxWidth: 600, height: 40 },
  collapsedOrb: { windowWidth: 82, windowHeight: 136, visibleWidth: 82, visibleHeight: 136 },
  edgeCapsule: { width: 720, height: 180 },
  iconButton: { card: 36, bar: 30, rail: 40 },
} as const;
export type SurfaceSizes = typeof surfaceSizes;

/**
 * visual-spec §7 进度方向：
 * - 0% 起点固定在 12 点（顶部），顺时针增长。
 * - 100% 时保留 0.5°–1° 安全缝，避免圆头重叠和裁切。
 * - 刻度仅显示在圆环左侧 150°–245° 范围（visual-spec §7 刻度）。
 *
 * 这些角度常量供 progress-ring-geometry.ts 使用，集中在 token 层方便 review。
 */
export const ringAngles = {
  /** SVG 坐标系下 12 点方向的角度（数学坐标系 90°，但 SVG y 轴向下，所以是 -90° 或 270°）。 */
  startAt12OClock: -90,
  /** 100% 时保留的安全缝角度（度）。visual-spec §7：0.5°–1°，取上限 1° 保证圆头不重叠。 */
  fullCircleSafetyGap: 1,
  /** 刻度起始角度（左侧，visual-spec §7：150°）。 */
  tickRangeStart: 150,
  /** 刻度结束角度（左侧，visual-spec §7：245°）。 */
  tickRangeEnd: 245,
  /** 刻度数量范围（visual-spec §7：8–10 个）。 */
  tickCount: 9,
} as const;
export type RingAngles = typeof ringAngles;
