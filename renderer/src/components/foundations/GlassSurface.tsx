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
 * 实现用多层 background-image + box-shadow inset 双层边缘/内部环境光晕。
 * backdrop-filter 作为辅助模糊，主玻璃感来自透明叠层和描边（visual-spec §4 材质约束）。
 * Electron 固定透明窗口不绘制外部蓝色投影，避免被窗口边缘裁切和暗色背景上的重色边。
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

  // 一条 box-shadow 串统一承载 1px 内高光、完整 inset edge、右下 shade 与环境光晕。
  // 旧实现的 inline boxShadow 会覆盖 cva class 里的 highlight，导致主 surface 实际没有内高光。
  // button 可额外保留小组件中性外阴影；固定透明主窗口继续不绘制外部蓝色投影。
  const insetDefinition = [
    "inset 0 1px 0 color-mix(in srgb, var(--c-border) 82%, white 18%)",
    "inset 1px 0 0 color-mix(in srgb, var(--c-border) 66%, transparent)",
    "inset 0 0 0 1px color-mix(in srgb, white 10%, transparent)",
    "inset 0 -1px 0 color-mix(in srgb, var(--c-border) 56%, transparent)",
    "inset -1px 0 0 color-mix(in srgb, var(--c-border) 36%, transparent)",
    "inset 0 0 32px color-mix(in srgb, var(--c-blue-wash) 28%, transparent)",
  ].join(", ");
  const shadow = surface === "button" ? `${insetDefinition}, var(--shadow-small)` : insetDefinition;

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
  // visual-spec §4 Light/Dark 重心。三组规范色扩大柔和衰减范围，避免局部色块和纯平底色。
  return [
    // 顶部/中心 blue（visual-spec：Top/center blue）
    "radial-gradient(110% 90% at 48% -10%, var(--c-blue-wash) 0%, color-mix(in srgb, var(--c-blue-wash) 42%, transparent) 42%, transparent 72%)",
    // 底部/左 mint
    "radial-gradient(92% 82% at -8% 110%, var(--c-mint-wash) 0%, color-mix(in srgb, var(--c-mint-wash) 40%, transparent) 46%, transparent 74%)",
    // 底部/右 violet
    "radial-gradient(92% 82% at 108% 112%, var(--c-violet-wash) 0%, color-mix(in srgb, var(--c-violet-wash) 40%, transparent) 46%, transparent 74%)",
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
