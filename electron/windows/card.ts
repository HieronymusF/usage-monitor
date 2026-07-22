import type { SurfaceWindowSpec } from "./types.js";

/**
 * Card 窗口尺寸。对照 WPF(UsageMonitor.xaml:4):Window 576×404,透明无边框。
 * Card 元素用 margin 8px(视觉 560×388),DropShadow 画到窗口边缘被自然裁切
 * (WPF 同款行为,BlurRadius=48 大部分被窗口吃掉,只露约 8px 阴影)。
 */
export const cardWindowSpec: SurfaceWindowSpec = {
  kind: "card",
  width: 576,
  height: 404,
  resizable: false,
};
