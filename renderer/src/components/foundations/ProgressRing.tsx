import React from "react";
/**
 * ProgressRing — 6 层同心 SVG 进度环。
 *
 * 视觉规格（visual-spec §7）：
 * 1. OuterHalo：外缘柔光，accent 18% opacity，blur
 * 2. OuterBorder：1px 外环描边
 * 3. Rail：主轨道，strokeWidth 按尺寸
 * 4. Ticks：左侧刻度，仅 hero/side
 * 5. InnerDisc：内层玻璃圆盘 + 极弱径向高光
 * 6. ProgressArc：蓝→青渐变、圆头；起点带圆形珠
 *
 * P0 修复（光晕不超框）：
 * - viewBox 扩展到包含 OuterHalo 的完整绘制区（halo 半径 + blur），
 *   不依赖 overflow:visible。所有层共用同一中心。
 * - 组件框宽高 = viewBox 尺寸（halo 不会超出 svg 元素）。
 *
 * P1 修复（0% vs unavailable 状态契约区分）：
 * - progress=0：画 rail + 起点珠（"已开始但未消耗"，0% 是有效值）
 * - progress=null：画虚线 rail 无起点珠（"不可用"，与 0% 视觉区分）
 *
 * P1 修复（无障碍）：
 * - 传 aria-label 时 svg role="img" + aria-label；不传时 aria-hidden
 */

import { useId, type CSSProperties } from "react";
import {
  describeArc,
  pointOnCircle,
  progressToDegrees,
  ringLayout,
  tickPositions,
} from "./progress-ring-geometry";
import type { RingSize } from "../../styles/tokens";
import { ringAngles } from "../../styles/tokens";

export interface ProgressRingProps {
  size: RingSize;
  /** 进度 0-100；null = unavailable。0% 和 null 视觉不同（见上方契约）。 */
  progress: number | null;
  className?: string;
  /** 可选 aria-label（无障碍名称）。不传则 svg 对 AT 不可见。 */
  "aria-label"?: string;
  /** 可选 inline style（用于绝对定位叠加）。 */
  style?: CSSProperties;
}

/**
 * OuterHalo 的 blur 半径（px）。halo 用 stroke=accent + filter:blur，
 * blur 会让边缘扩散这么多。P0：必须算进完整绘制区。
 */
const HALO_BLUR_PX = 4;
/** OuterHalo 描边宽度系数（相对 ring stroke）。 */
const HALO_STROKE_FACTOR = 0.5;

/**
 * 计算指定尺寸圆环的完整绘制区边长（含 OuterHalo + blur）。
 * 所有 6 层都不能超出这个边长。P0 修复核心。
 */
/**
 * 圆环组件框尺寸。对照 WPF:圆环容器 = frame(126/198),Ellipse = diameter(118/190)。
 * halo 超出 frame 时靠 svg overflow:visible 显示(被 Card 主区约束)。
 * 之前曾扩到 frame + halo 余量,导致容器撑大破坏布局——已回退。
 */
export function ringDrawableSize(size: RingSize): number {
  return ringLayout(size).frame;
}

export function ProgressRing({
  size,
  progress,
  className,
  style,
  "aria-label": ariaLabel,
  ...rest
}: ProgressRingProps) {
  const layout = ringLayout(size);
  const drawableSize = ringDrawableSize(size);
  // 中心在 drawable 区域的几何中心（所有层共用，visual-spec §7）
  const cx = drawableSize / 2;
  const cy = drawableSize / 2;
  const radius = layout.diameter / 2;

  const showTicks = size === "hero" || size === "side";
  const ticks = showTicks
    ? tickPositions(cx, cy, radius + layout.stroke / 2, size === "hero" ? 10 : 8)
    : [];

  const isUnavailable = progress === null;
  const endDegrees = progressToDegrees(progress);
  // 0% 也是有效值：画起点珠但不画弧（"已开始但未消耗"）
  // null 是不可用：不画起点珠，rail 用虚线
  const showProgressArc = !isUnavailable && endDegrees > 0;
  const showStartKnob = !isUnavailable; // 0% 和 >0% 都画珠；null 不画
  const startPoint = pointOnCircle(cx, cy, radius, 0);

  const gradientId = useId().replace(/:/g, "");
  const hasLabel = Boolean(ariaLabel);

  return (
    <svg
      width={drawableSize}
      height={drawableSize}
      viewBox={`0 0 ${drawableSize} ${drawableSize}`}
      className={className}
      // P1-5：aria-label 真正写入 svg（role + aria-label）
      role={hasLabel ? "img" : undefined}
      aria-label={hasLabel ? ariaLabel : undefined}
      aria-hidden={hasLabel ? undefined : true}
      // halo 超出 frame,靠 overflow:visible 显示(被 Card 主区约束)。
      // viewBox=frame,但 halo 的 circle 画在 viewBox 外仍可见。
      style={{ overflow: "visible", ...style } as CSSProperties}
      {...rest}
    >
      <defs>
        <linearGradient id={`ring-progress-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--c-accent-start)" />
          <stop offset="100%" stopColor="var(--c-accent-end)" />
        </linearGradient>
        <radialGradient id={`ring-disc-${gradientId}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--c-base-glass) 100%, white)" />
          <stop offset="100%" stopColor="var(--c-base-glass)" />
        </radialGradient>
      </defs>

      {/* 第 1 层：OuterHalo（外缘柔光） */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + layout.stroke}
        fill="none"
        stroke="var(--c-accent-start)"
        strokeWidth={layout.stroke * HALO_STROKE_FACTOR}
        opacity={0.18}
        style={{ filter: `blur(${HALO_BLUR_PX}px)` }}
      />

      {/* 第 2 层：OuterBorder（1px 外描边） */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + layout.stroke / 2 + 0.5}
        fill="none"
        stroke="var(--c-border)"
        strokeWidth={1}
      />

      {/* 第 3 层：Rail（主轨道）。unavailable 时虚线区分 0%。 */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--c-rail)"
        strokeWidth={layout.stroke}
        strokeDasharray={isUnavailable ? "4 4" : undefined}
      />

      {/* 第 4 层：Ticks（仅 hero/side，左侧弧段） */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke="var(--c-secondary)"
          strokeWidth={size === "hero" ? 1.75 : 1.5}
          opacity={0.24}
        />
      ))}

      {/* 第 5 层：InnerDisc（内层玻璃圆盘） */}
      <circle cx={cx} cy={cy} r={layout.innerDisc / 2} fill={`url(#ring-disc-${gradientId})`} />
      <circle
        cx={cx}
        cy={cy}
        r={layout.innerDisc / 2}
        fill="none"
        stroke="var(--c-border)"
        strokeWidth={0.5}
        opacity={0.6}
      />

      {/* 第 6 层：ProgressArc + StartKnob（仅非 unavailable） */}
      {showProgressArc ? (
        <path
          d={describeArc(cx, cy, radius, 0, endDegrees)}
          fill="none"
          stroke={`url(#ring-progress-${gradientId})`}
          strokeWidth={layout.stroke}
          strokeLinecap="round"
        />
      ) : null}
      {showStartKnob ? (
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={layout.stroke / 2}
          fill="var(--c-accent-start)"
        />
      ) : null}
    </svg>
  );
}

export { ringAngles };
