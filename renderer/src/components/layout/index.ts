/**
 * Layout primitives — Stack / Inline / Grid（DESIGN_SYSTEM.md §8）。
 *
 * 所有业务组件的 flex/grid 布局应优先用这三个原语，gap 通过 Spacing token key 传入，
 * 避免裸 px 字符串和视觉补偿值（如历史代码 TokenTray 的 marginLeft:"14px"）。
 */

export { Stack } from "./Stack";
export type { StackProps } from "./Stack";
export { Inline } from "./Inline";
export type { InlineProps } from "./Inline";
export { Grid } from "./Grid";
export type { GridProps } from "./Grid";
