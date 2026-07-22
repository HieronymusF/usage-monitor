/**
 * Stack — 纵向 flex 布局原语（DESIGN_SYSTEM.md §8 Layout Rules）。
 *
 * 用法：`<Stack gap="2" align="center">...</Stack>`
 * gap 必须是 Spacing key（"0_5"|"1"|"1_5"|"2"|"3"|"4"），从类型层面杜绝裸数字。
 *
 * 解决的问题（反 CSS-patch）：业务组件不再写 `style={{display:"flex", flexDirection:"column", gap:"14px"}}`，
 * 而是用 `<Stack gap="...">`，gap 值来自 spacing token。
 */

import type { CSSProperties, ReactNode } from "react";
import React from "react";
import { spacing, type Spacing } from "../../styles/tokens";

export interface StackProps {
  children: ReactNode;
  /** Spacing token key。未传则不设 gap。 */
  gap?: Spacing;
  /** flex align-items。 */
  align?: CSSProperties["alignItems"];
  /** flex justify-content。 */
  justify?: CSSProperties["justifyContent"];
  /** 透传内联样式（仅用于 token 无法覆盖的场景）。 */
  style?: CSSProperties;
  /** 透传 className。 */
  className?: string;
  /** 透传 id 等原生属性。 */
  id?: string;
  /** 透传 data-testid。 */
  "data-testid"?: string;
}

export function Stack({
  children,
  gap,
  align,
  justify,
  style,
  className,
  id,
  ...rest
}: StackProps): React.ReactElement {
  const testId = rest["data-testid"];
  return (
    <div
      id={id}
      className={className}
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
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
