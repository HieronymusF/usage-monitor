import React from "react";
/**
 * GlassSurface — Polar Aurora Glass 4 层玻璃材质容器。
 *
 * 视觉规格：visual-spec §4 材质配方
 *   1. Base glass：主表面，半透明冷白/深海军蓝（--c-base-glass）
 *   2. Aurora wash：蓝/薄荷/紫三组径向渐变叠层（--c-blue-wash / mint-wash / violet-wash）
 *   3. Inner highlight：1px 内高光（左上更亮）
 *   4. Outer definition：1px 外描边 + 柔和投影
 *
 * 实现用多层 background-image（CSS 不支持伪元素分离时）+ box-shadow inset + 外阴影。
 * backdrop-filter 作为辅助模糊，主玻璃感来自透明叠层和描边（visual-spec §4 材质约束）。
 *
 * Aurora 位置（visual-spec §4 Light/Dark 重心）：
 *   - 顶部/中心：blue（Light 18%，Dark navy）
 *   - 底部/左：mint（Light 20%，Dark cyan）
 *   - 底部/右：violet（Light 22%，Dark violet）
 */

import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { radius } from "../../styles/tokens";
import { cn } from "../../lib/utils";

/**
 * 变体：surface 决定圆角和阴影强度。
 * card/tray/bar/orb/capsule 对应 design-tokens §radius。
 */
const glassSurfaceVariants = cva(
  // base：4 层玻璃材质。background 用多层 image 叠加，第一个是最上层。
  [
    "relative isolate",
    // backdrop-filter 辅助（visual-spec §4：主要玻璃感不靠模糊，但保留低 blur 增强氛围）
    "backdrop-blur-xl",
    // 外描边 1px（visual-spec §4 Outer definition）
    "border border-solid",
    // Outer highlight：左上更亮的内高光
    "shadow-[inset_0_1px_0_color-mix(in_srgb,white_42%,transparent)]",
  ].join(" "),
  {
    variants: {
      surface: {
        // card：34px 圆角 + 完整 aurora + 主卡阴影
        card: "",
        tray: "",
        bar: "",
        orb: "",
        capsule: "",
        // button：小尺寸玻璃（IconButton 用），无 aurora，只有 base + highlight
        button: "",
      },
    },
    compoundVariants: [],
    defaultVariants: { surface: "card" },
  },
);

export interface GlassSurfaceProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof glassSurfaceVariants> {}

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(function GlassSurface(
  { className, surface, style, ...props },
  ref,
) {
  // 通过 inline style 注入 token-driven 的 CSS，避免 Tailwind 工具类无法表达
  // "多层径向渐变叠层 + 半透明底色"。
  const surfaceStyle = getSurfaceStyle(surface ?? "card");
  return (
    <div
      ref={ref}
      className={cn(glassSurfaceVariants({ surface }), className)}
      style={{ ...surfaceStyle, ...style }}
      {...props}
    />
  );
});

/**
 * 计算 surface 的 CSS 样式（多层 background + 圆角 + 阴影）。
 * 抽成函数便于测试（DOM attr 级别）和未来视觉回归对比。
 */
export function getSurfaceStyle(surface: string): React.CSSProperties {
  const radiusValue = radiusForSurface(surface);
  const aurora = auroraBackgrounds(surface);

  // 外阴影:用户反馈暗色背景下蓝色阴影太明显,去掉 card/capsule 外阴影,只留 border。
  // 小组件(button)保留极轻 box-shadow 表达层级。
  // 未来如需恢复阴影,改回 var(--shadow-card) + 调 opacity。
  const shadow = surface === "button" ? "var(--shadow-small)" : "none";

  return {
    borderRadius: `${radiusValue}px`,
    // 多层 background：aurora 渐变在最上层（先列），base glass 在底
    backgroundImage: aurora,
    backgroundColor: "var(--c-base-glass)",
    backgroundBlendMode: "normal",
    boxShadow: shadow,
    // 1px 描边用 border color token
    borderColor: "var(--c-border)",
  };
}

/** aurora wash 渐变定义。button 变体不加 aurora（保持简洁）。 */
function auroraBackgrounds(surface: string): string {
  if (surface === "button") return "none";
  // visual-spec §4 Light/Dark 重心。用 radial-gradient 在卡片四角铺极光。
  return [
    // 顶部/中心 blue（visual-spec：Top/center blue）
    "radial-gradient(120% 80% at 50% 0%, var(--c-blue-wash) 0%, transparent 55%)",
    // 底部/左 mint
    "radial-gradient(100% 60% at 0% 100%, var(--c-mint-wash) 0%, transparent 60%)",
    // 底部/右 violet
    "radial-gradient(100% 60% at 100% 100%, var(--c-violet-wash) 0%, transparent 60%)",
  ].join(", ");
}

function radiusForSurface(surface: string): number {
  switch (surface) {
    case "card":
      return radius.card;
    case "tray":
      return radius.tray;
    case "bar":
      return radius.bar;
    case "orb":
      return radius.orb;
    case "capsule":
      return radius.capsuleLeft;
    case "button":
      return radius.button36;
    default:
      return radius.card;
  }
}
