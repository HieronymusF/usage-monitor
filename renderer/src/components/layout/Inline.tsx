/**
 * Inline — 横向 flex 布局原语（DESIGN_SYSTEM.md §8 Layout Rules）。
 *
 * 用法：`<Inline gap="1" align="center">...</Inline>`
 * gap 必须是 Spacing key。wrap 控制是否换行。
 */

import type { CSSProperties, ReactNode } from "react";
import React from "react";
import { spacing, type Spacing } from "../../styles/tokens";

export interface InlineProps {
  children: ReactNode;
  gap?: Spacing;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  /** 是否允许换行，默认 false。 */
  wrap?: boolean;
  style?: CSSProperties;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

export function Inline({
  children,
  gap,
  align,
  justify,
  wrap = false,
  style,
  className,
  id,
  ...rest
}: InlineProps): React.ReactElement {
  const testId = rest["data-testid"];
  return (
    <div
      id={id}
      className={className}
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: wrap ? "wrap" : "nowrap",
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
