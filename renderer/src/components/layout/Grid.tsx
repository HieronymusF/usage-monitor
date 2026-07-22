/**
 * Grid — CSS Grid 布局原语（DESIGN_SYSTEM.md §8 Layout Rules）。
 *
 * 用法：
 * - 等分列：`<Grid columns={3} gap="1_5">`（生成 `repeat(3, 1fr)`）
 * - 自定义列：`<Grid columns="340px 20px 1px 20px 1fr">`（原样传入）
 *
 * gap 必须是 Spacing key。surface 内固定几何值（如 Card 主区 340px/560px）
 * 属于 visual-spec §5 契约值，允许作为 columns 字符串的一部分（见 DESIGN_SYSTEM.md §13 白名单）。
 */

import type { CSSProperties, ReactNode } from "react";
import React from "react";
import { spacing, type Spacing } from "../../styles/tokens";

export interface GridProps {
  children: ReactNode;
  /** 列定义：数字 → repeat(n, 1fr)；字符串 → 原样作为 grid-template-columns。 */
  columns: number | string;
  gap?: Spacing;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  style?: CSSProperties;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

export function Grid({
  children,
  columns,
  gap,
  align,
  justify,
  style,
  className,
  id,
  ...rest
}: GridProps): React.ReactElement {
  const testId = rest["data-testid"];
  const templateColumns = typeof columns === "number" ? `repeat(${columns}, 1fr)` : columns;
  return (
    <div
      id={id}
      className={className}
      data-testid={testId}
      style={{
        display: "grid",
        gridTemplateColumns: templateColumns,
        ...(gap !== undefined ? { gap: `${spacing[gap]}px` } : {}),
        ...(align !== undefined ? { alignItems: align } : {}),
        ...(justify !== undefined ? { justifyContent: justify } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
