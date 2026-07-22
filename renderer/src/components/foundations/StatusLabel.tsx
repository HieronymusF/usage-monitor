import React from "react";
/**
 * StatusLabel — 状态点 + 文字，颜色和文字双编码。
 *
 * 无障碍红线（AGENTS.md + visual-spec §4）：
 * 状态不只靠颜色表达。健康度（sufficient/low/critical/unavailable）
 * 同时映射到颜色（success/warning/danger/rail）和文字（充足/偏低/紧张/服务未提供）。
 *
 * 文字由调用方传入 i18n key 的结果（不在组件内硬编码中文），保证国际化。
 */

import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { typography } from "../../styles/tokens";
import { cn } from "../../lib/utils";

/** 健康度 → 颜色 token 映射（与 classify-health.ts 的 Health 类型一致）。 */
export type StatusKind = "sufficient" | "low" | "critical" | "unavailable";

const statusVariants = cva("inline-flex items-center gap-2", {
  variants: {
    status: {
      sufficient: "text-[var(--c-success)]",
      low: "text-[var(--c-warning)]",
      critical: "text-[var(--c-danger)]",
      unavailable: "text-[var(--c-tertiary)]",
    },
  },
  defaultVariants: { status: "unavailable" },
});

export interface StatusLabelProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">, VariantProps<typeof statusVariants> {
  /** 状态文字（由调用方提供 i18n 结果，如 t("health.sufficient")）。 */
  label: string;
  /** 点的大小（默认 8px，匹配 visual-scale §2 8px 网格）。 */
  dotSize?: number;
}

export const StatusLabel = forwardRef<HTMLSpanElement, StatusLabelProps>(function StatusLabel(
  { className, status, label, dotSize = 8, style, ...props },
  ref,
) {
  const caption = typography.caption;
  return (
    <span
      ref={ref}
      role="status"
      className={cn(statusVariants({ status }), className)}
      style={{
        fontFamily: caption.fontFamily,
        fontSize: `${caption.fontSize}px`,
        // ⚠️ React inline style 无单位 lineHeight = 倍率（13 * 19 = 247px）。必须 px。P0 修复。
        lineHeight: `${caption.lineHeight}px`,
        fontWeight: caption.fontWeight,
        ...style,
      }}
      {...props}
    >
      {/* 状态点：圆，颜色用当前 status 色 */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          borderRadius: "50%",
          backgroundColor: "currentColor",
          flexShrink: 0,
        }}
      />
      {/* 文字：双编码（不只靠颜色）。screen reader 读得到。 */}
      <span>{label}</span>
    </span>
  );
});
