/**
 * QuotaRail — 5h Hero 用的水平进度条。
 *
 * visual-spec §5 Codex Dual 左侧 5h Hero："百分比、轨道、状态、重置"。
 * 这是水平横条（不是圆环）。轨道灰，进度蓝→青渐变，圆头。
 *
 * WPF 对应：HeroFiveRail（XAML L176-177），宽度 = 352 * remaining/100。
 */

import React, { type CSSProperties } from "react";

export interface QuotaRailProps {
  /** 剩余百分比 0-100。null = unavailable，轨道空，不画进度。 */
  remainingPercent: number | null;
  /** 轨道总宽（px）。默认 352（HeroLeftSurface 列宽，来自 WPF）。 */
  width?: number;
  /** 高度。默认 8（匹配 visual-spec 圆环描边的视觉重量）。 */
  height?: number;
}

export function QuotaRail({
  remainingPercent,
  width = 340,
  height = 8,
}: QuotaRailProps): React.ReactElement {
  const hasValue = remainingPercent !== null && Number.isFinite(remainingPercent);
  const clamped = hasValue ? Math.min(100, Math.max(0, remainingPercent as number)) : 0;
  const progressWidth = (width * clamped) / 100;

  const containerStyle: CSSProperties = {
    position: "relative",
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: `${height / 2}px`,
    background: "var(--c-rail)",
    overflow: "hidden",
  };

  const progressStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    height: "100%",
    width: `${progressWidth}px`,
    borderRadius: `${height / 2}px`,
    // visual-spec §7：accent-start → accent-end 切向渐变
    backgroundImage: "linear-gradient(90deg, var(--c-accent-start), var(--c-accent-end))",
    transition: "width 300ms cubic-bezier(0.16, 1, 0.3, 1)",
  };

  return (
    <div style={containerStyle} role="progressbar" aria-valuemin={0} aria-valuemax={100}>
      {hasValue ? <div style={progressStyle} /> : null}
    </div>
  );
}
