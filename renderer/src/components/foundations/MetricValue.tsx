import React from "react";
/**
 * MetricValue — 数字 + 单位 + 标签的组合，强制 tabular-nums。
 *
 * visual-spec §1：
 * - 数字启用 Tabular + Lining numerals（body 全局已设，这里继承）
 * - 主要数字、百分号和单位分别设定字号，但必须共享底部基线
 * - 百分号字号为对应数字字号的 48%–54%
 * - 单位 M 使用对应数值字号的 50%–58%
 *
 * typography variant 来自 design-tokens §typography。
 * 缺失值（null）显示占位（由调用方提供，如 "—" 或 i18n 的"服务未提供"）。
 */

import { forwardRef, type HTMLAttributes } from "react";
import { typography, type TypographyVariant } from "../../styles/tokens";
import { cn } from "../../lib/utils";

export interface MetricValueProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** 主数值（已格式化的字符串，如 "42" / "1.65M" / "—"）。 */
  value: string;
  /** 单位（如 "%" / "M" / "tokens"），可选。字号是主数值的 50-58%。 */
  unit?: string;
  /** 标签（如 "剩余" / "今日"），在数值上方。用 caption 样式。 */
  label?: string;
  /** typography variant，决定主数值字号。 */
  variant?: TypographyVariant;
  /** 颜色（默认 ink；可用 "var(--c-success)" 等覆盖）。 */
  color?: string;
}

export const MetricValue = forwardRef<HTMLSpanElement, MetricValueProps>(function MetricValue(
  { className, value, unit, label, variant = "metricM", color, style, ...props },
  ref,
) {
  const token = typography[variant];
  // visual-spec §1：单位字号 = 主数值的 50-58%（取 54%）；百分号 48-54%（取 51%）。
  // 单位 % 走更小比例，避免视觉抢戏。
  const unitScale = unit === "%" ? 0.51 : 0.54;
  const unitSize = Math.round(token.fontSize * unitScale);

  return (
    <span
      ref={ref}
      className={cn("inline-flex flex-col", className)}
      style={{ color: color ?? "var(--c-ink)", ...style }}
      {...props}
    >
      {label ? (
        <span
          style={{
            fontFamily: typography.caption.fontFamily,
            fontSize: `${typography.caption.fontSize}px`,
            // ⚠️ React inline style 里无单位 lineHeight 会被当成倍率（13 * 19 = 247px）。
            // 必须显式 px 单位。P0 修复。
            lineHeight: `${typography.caption.lineHeight}px`,
            fontWeight: typography.caption.fontWeight,
            color: "var(--c-tertiary)",
          }}
        >
          {label}
        </span>
      ) : null}
      <span
        style={{
          fontFamily: token.fontFamily,
          fontSize: `${token.fontSize}px`,
          // 同上：必须 px 单位，否则 60 * 64 = 3840px。
          lineHeight: `${token.lineHeight}px`,
          fontWeight: token.fontWeight,
          fontVariantNumeric: "tabular-nums lining-nums",
          display: "inline-flex",
          alignItems: "baseline",
        }}
      >
        <span>{value}</span>
        {unit ? <span style={{ fontSize: `${unitSize}px`, marginLeft: "2px" }}>{unit}</span> : null}
      </span>
    </span>
  );
});
