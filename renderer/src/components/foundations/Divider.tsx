import React from "react";
/**
 * Divider — 1px 分隔线（visual-spec §2 8px 网格）。
 *
 * Light 用 border 色，Dark 同。透明度通过 border-color 的 alpha 体现。
 * 支持垂直/水平方向。
 */

import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const dividerVariants = cva("shrink-0 bg-[var(--c-border)]", {
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "w-px h-full",
    },
  },
  defaultVariants: { orientation: "horizontal" },
});

export interface DividerProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof dividerVariants> {}

export const Divider = forwardRef<HTMLDivElement, DividerProps>(function Divider(
  { className, orientation, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
      className={cn(dividerVariants({ orientation }), className)}
      {...props}
    />
  );
});
