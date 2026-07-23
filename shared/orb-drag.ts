/**
 * orb-drag — Orb 拖动 click/drag 判定 + 贴边吸附纯函数（CI 可测）。
 *
 * 用于 D-3 切片 3：
 * - shouldStartDrag：pointermove 总位移是否超过 6 DIP 阈值（区分 click vs drag）。
 * - snapOrbToEdge：拖动结束后把 Orb 吸附到所在显示器最近的左/右边缘 + Y clamp。
 *
 * 几何来源：WPF Snap-OrbToNearestEdge（companion/CodexUsageMonitor.ps1:1296-1305）+ 产品
 * PRD §6.5（拖动 >6 DIP 只移动不展开 / 拖动结束贴边）。Electron 用 DIP 坐标（screen API
 * 的 bounds/workArea 已析出 scaleFactor），无需手动 /scale。
 */

/** 矩形（Electron Rectangle 风格：x/y/width/height，DIP）。 */
export interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 默认 click/drag 阈值（DIP）。PRD §6.5 写 6 DIP，对齐 WPF 逐轴 >5px 判定。 */
const DEFAULT_DRAG_THRESHOLD_DIP = 6;
/** 贴边边距（DIP）。与 showOnly anchor 的 6px 边距一致（manager.ts:91-96）。 */
const DEFAULT_SNAP_MARGIN_DIP = 6;

/**
 * 判断 pointer 总位移是否超过拖动阈值（即"这是拖动不是 click"）。
 *
 * 用 max(|dx|, |dy|) 逐轴判定（对齐 WPF `Math::Abs(dx) -gt 5` 的逐轴 OR 语义），
 * 而非 hypot（对角线移动不会被放大判定）。
 *
 * @param dx X 总位移（DIP，pointerup.screenX - pointerdown.screenX）
 * @param dy Y 总位移（DIP）
 * @param thresholdDip 阈值，默认 6
 * @returns true = 应按拖动处理（移动 + 松手贴边）；false = 应按 click 处理（展开）
 */
export function shouldStartDrag(
  dx: number,
  dy: number,
  thresholdDip = DEFAULT_DRAG_THRESHOLD_DIP,
): boolean {
  return Math.max(Math.abs(dx), Math.abs(dy)) > thresholdDip;
}

/**
 * 计算拖动结束后 Orb 应吸附到的目标位置（DIP）。纯函数，不碰窗口。
 *
 * 算法（对齐 WPF Snap-OrbToNearestEdge）：
 * 1. Y clamp 到 workArea：`[workArea.y + margin, workArea.y + workArea.height - bounds.height - margin]`
 * 2. 按窗口水平中心 vs workArea 水平中心选边：
 *    - 窗口中心 < workArea 中心 → 贴左（x = workArea.x + margin）
 *    - 否则 → 贴右（x = workArea.x + workArea.width - bounds.width - margin）
 *
 * @param bounds 当前 Orb 窗口 bounds（DIP）
 * @param workArea 所在显示器工作区（DIP，screen.getDisplayMatching(bounds).workArea）
 * @param margin 边距，默认 6
 * @returns 目标 {x, y}（已 Math.round）
 */
export function snapOrbToEdge(
  bounds: DragRect,
  workArea: DragRect,
  margin = DEFAULT_SNAP_MARGIN_DIP,
): { x: number; y: number } {
  // Y clamp 到 workArea（含上下边距）。
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - bounds.height - margin;
  const y = Math.max(minY, Math.min(maxY, bounds.y));

  // 按水平中心选左/右贴边。
  const boundsCenterX = bounds.x + bounds.width / 2;
  const workAreaCenterX = workArea.x + workArea.width / 2;
  const x =
    boundsCenterX < workAreaCenterX
      ? workArea.x + margin
      : workArea.x + workArea.width - bounds.width - margin;

  return { x: Math.round(x), y: Math.round(y) };
}
