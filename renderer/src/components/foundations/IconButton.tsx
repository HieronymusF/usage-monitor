import React from "react";
/**
 * IconButton — 圆形玻璃按钮，36/30 两尺寸，5 种交互态。
 *
 * 视觉规格（visual-spec §3 + §8 交互状态表）：
 * - 尺寸：Card 36×36 / Bar 30×30，圆形玻璃材质
 * - Default：base glass，图标 secondary 色
 * - Hover：106% 亮度 + Accent 24% 描边混合 + Y -1px 位移
 * - Pressed：96% 亮度 + Accent 36% 描边混合 + Y 0
 * - Focus：2px accent focus ring 外扩 2px（不改变布局）
 * - Disabled：55% opacity
 * - 按钮状态变化不得改变尺寸（visual-spec §8）
 *
 * P0 修复：按钮自身必须有 position:relative，否则内部 absolute 玻璃层
 * 会锚定到最近的 positioned 祖先（卡片），扩张覆盖整张卡片。
 *
 * P1 修复：
 * - Hover/Pressed 的 Accent 描边混合用 CSS 自定义属性 + group-hover 实现
 * - 加 title（tooltip）：visual-spec 要求按钮有 tooltip
 *
 * 无障碍：aria-label 必传（红线：不只靠颜色/图标表达）；title 同时作为 tooltip。
 */

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { radius, stroke, surfaceSizes } from "../../styles/tokens";
import { cn } from "../../lib/utils";
import { GlassSurface } from "./GlassSurface";

const iconButtonVariants = cva(
  [
    // P0：relative 让内部 absolute 玻璃层锚定到按钮自身
    "relative inline-flex items-center justify-center overflow-hidden",
    "transition-[transform,filter,border-color] duration-150",
    "outline-none",
    // Disabled：55% opacity（visual-spec §8）
    "disabled:opacity-55 disabled:pointer-events-none",
  ].join(" "),
  {
    variants: {
      size: {
        card: "",
        bar: "",
        rail: "",
      },
    },
    defaultVariants: { size: "card" },
  },
);

export interface IconButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof iconButtonVariants> {
  /** 图标节点（lucide 图标组件或 SVG）。 */
  children: ReactNode;
  /** 无障碍标签（必传，红线：不只靠图标表达）。同时作为 tooltip。 */
  "aria-label": string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, size = "card", children, style, title, ...props },
  ref,
) {
  const px =
    size === "rail"
      ? surfaceSizes.iconButton.rail
      : size === "bar"
        ? surfaceSizes.iconButton.bar
        : surfaceSizes.iconButton.card;
  const radiusValue =
    size === "rail" ? radius.button40 : size === "bar" ? radius.button30 : radius.button36;
  // aria-label 同时作为 tooltip（visual-spec 要求按钮有 tooltip）
  const tooltip = title ?? props["aria-label"];

  // P1-6：Hover/Pressed 的 Accent 描边混合用 CSS 属性驱动。
  // :hover / :active 时改 --border-mix，GlassSurface 的 border 读这个变量。
  // 不能用 Tailwind 的 hover: 因为玻璃层在子元素，需要容器状态穿透到子元素 border。
  const buttonStyle: CSSProperties = {
    position: "relative", // P0：锚定内部 absolute
    width: `${px}px`,
    height: `${px}px`,
    borderRadius: `${radiusValue}px`,
    padding: 0,
    cursor: props.disabled ? "default" : "pointer",
    outlineOffset: `${stroke.focus}px`,
    // 默认 border-mix = 0；hover/pressed 通过 CSS class 覆盖
    ["--border-mix" as string]: "0%",
    ...style,
  };

  return (
    <button
      ref={ref}
      type="button"
      title={tooltip}
      className={cn(
        iconButtonVariants({ size }),
        // P1-6：Hover = Accent 24% 混合 + Y -1 + 106% 亮度
        "hover:-translate-y-px hover:brightness-106 hover:[--border-mix:24%]",
        // P1-6：Pressed = Accent 36% 混合 + Y 0 + 96% 亮度
        "active:translate-y-0 active:brightness-96 active:[--border-mix:36%]",
        // Focus：2px accent ring 外扩 2px
        "focus-visible:ring-2 focus-visible:ring-[var(--c-accent-start)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        className,
      )}
      style={buttonStyle}
      {...props}
    >
      <GlassSurface
        surface="button"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: `${radiusValue}px`,
          pointerEvents: "none",
          // P1-6：border 在 base 上叠 accent 混合
          borderColor:
            "color-mix(in srgb, var(--c-accent-start) var(--border-mix), var(--c-border))",
        }}
      />
      {/* 图标层：相对定位在玻璃之上，hover 时变 ink 色 */}
      <span
        className="relative z-10 inline-flex items-center justify-center transition-colors"
        style={{ color: "var(--c-secondary)" }}
      >
        {children}
      </span>
    </button>
  );
});
