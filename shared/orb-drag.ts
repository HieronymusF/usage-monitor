/**
 * orb-drag — Orb 拖动 click/drag 判定 + 边缘收回几何纯函数（CI 可测）。
 *
 * 用于 D-3 切片 3：
 * - shouldStartDrag：pointermove 总位移是否超过 6 DIP 阈值（区分 click vs drag）。
 * - inferOrbDropEdge：拖放时只识别真正碰到/越过的左右边缘。
 * - snapOrbToEdge/placeOrbAtEdge：进入边缘收回态时定位左右外沿并部分隐藏 + Y clamp。
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

export type OrbSnapEdge = "left" | "right";

/** 默认 click/drag 阈值（DIP）。PRD §6.5 写 6 DIP，对齐 WPF 逐轴 >5px 判定。 */
const DEFAULT_DRAG_THRESHOLD_DIP = 6;
/** 贴边边距（DIP）。与 showOnly anchor 的 6px 边距一致（manager.ts:91-96）。 */
const DEFAULT_SNAP_MARGIN_DIP = 6;
/** 360 类靠边隐藏：82 DIP 宽 Orb 只保留 24 DIP 可见，仍可发现、悬停和拖动。 */
export const ORB_EDGE_PEEK_DIP = 24;

/**
 * 判断 pointer 总位移是否超过拖动阈值（即"这是拖动不是 click"）。
 *
 * 用 max(|dx|, |dy|) 逐轴判定（对齐 WPF `Math::Abs(dx) -gt 5` 的逐轴 OR 语义），
 * 而非 hypot（对角线移动不会被放大判定）。
 *
 * @param dx X 总位移（DIP，pointerup.screenX - pointerdown.screenX）
 * @param dy Y 总位移（DIP）
 * @param thresholdDip 阈值，默认 6
 * @returns true = 应按拖动处理（移动 + 按松手位置判定边缘/自由）；false = 应按 click 处理（展开）
 */
export function shouldStartDrag(
  dx: number,
  dy: number,
  thresholdDip = DEFAULT_DRAG_THRESHOLD_DIP,
): boolean {
  return Math.max(Math.abs(dx), Math.abs(dy)) > thresholdDip;
}

/** 按窗口水平中心与 workArea 水平中心选择最近的左/右边。 */
export function nearestHorizontalEdge(bounds: DragRect, workArea: DragRect): OrbSnapEdge {
  const boundsCenterX = bounds.x + bounds.width / 2;
  const workAreaCenterX = workArea.x + workArea.width / 2;
  return boundsCenterX < workAreaCenterX ? "left" : "right";
}

/**
 * 把 Orb 放到指定左右边。visibleWidth 小于窗口宽度时，窗口越过 workArea 外沿，
 * 只留下 visibleWidth；等于窗口宽度时保持旧的完整可见 + margin 行为。
 */
export function placeOrbAtEdge(
  bounds: DragRect,
  workArea: DragRect,
  edge: OrbSnapEdge,
  margin = DEFAULT_SNAP_MARGIN_DIP,
  visibleWidth = ORB_EDGE_PEEK_DIP,
): { x: number; y: number } {
  // Y clamp 到 workArea（含上下边距）。
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - bounds.height - margin;
  const y = Math.max(minY, Math.min(maxY, bounds.y));

  const safeVisibleWidth = Math.max(1, Math.min(bounds.width, visibleWidth));
  const isHidden = safeVisibleWidth < bounds.width;
  const x =
    edge === "left"
      ? isHidden
        ? workArea.x - (bounds.width - safeVisibleWidth)
        : workArea.x + margin
      : isHidden
        ? workArea.x + workArea.width - safeVisibleWidth
        : workArea.x + workArea.width - bounds.width - margin;

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * 拖动结束后选择最近边，并应用 360 类部分隐藏。
 * 调用方须先用 canPeekOrbAtEdge 判断是否为真实桌面外沿；内屏接缝传 bounds.width 保持完整可见。
 */
export function snapOrbToEdge(
  bounds: DragRect,
  workArea: DragRect,
  margin = DEFAULT_SNAP_MARGIN_DIP,
  visibleWidth = ORB_EDGE_PEEK_DIP,
): { x: number; y: number } {
  return placeOrbAtEdge(
    bounds,
    workArea,
    nearestHorizontalEdge(bounds, workArea),
    margin,
    visibleWidth,
  );
}

/** 识别新半隐藏位置，同时兼容切片 3 已写入的完整可见旧位置。 */
export function inferOrbSnapEdge(
  bounds: DragRect,
  workArea: DragRect,
  margin = DEFAULT_SNAP_MARGIN_DIP,
  visibleWidth = ORB_EDGE_PEEK_DIP,
  tolerance = 1,
): OrbSnapEdge | null {
  const leftHidden = placeOrbAtEdge(bounds, workArea, "left", margin, visibleWidth).x;
  const rightHidden = placeOrbAtEdge(bounds, workArea, "right", margin, visibleWidth).x;
  const leftVisible = placeOrbAtEdge(bounds, workArea, "left", margin, bounds.width).x;
  const rightVisible = placeOrbAtEdge(bounds, workArea, "right", margin, bounds.width).x;
  if (
    Math.abs(bounds.x - leftHidden) <= tolerance ||
    Math.abs(bounds.x - leftVisible) <= tolerance
  ) {
    return "left";
  }
  if (
    Math.abs(bounds.x - rightHidden) <= tolerance ||
    Math.abs(bounds.x - rightVisible) <= tolerance
  ) {
    return "right";
  }
  return null;
}

/**
 * 拖动松手时判断 Orb 是否已经碰到/越过 workArea 左右边缘。
 * 与 inferOrbSnapEdge 不同，这里识别的是任意拖放坐标；只有进入边缘 margin 才吸附，
 * 屏幕中间继续保持自由悬浮。
 */
export function inferOrbDropEdge(
  bounds: DragRect,
  workArea: DragRect,
  threshold = DEFAULT_SNAP_MARGIN_DIP,
): OrbSnapEdge | null {
  const leftGap = bounds.x - workArea.x;
  const rightGap = workArea.x + workArea.width - (bounds.x + bounds.width);
  const touchesLeft = leftGap <= threshold;
  const touchesRight = rightGap <= threshold;
  if (touchesLeft && touchesRight) return nearestHorizontalEdge(bounds, workArea);
  if (touchesLeft) return "left";
  if (touchesRight) return "right";
  return null;
}

/**
 * 只有真实桌面外沿才能越界隐藏。侧边任务栏占用该边，或隐藏区域与另一显示器相交时，
 * 必须保持完整可见，避免 Orb 落到任务栏/相邻屏幕。
 */
export function canPeekOrbAtEdge(
  displayBounds: DragRect,
  workArea: DragRect,
  otherDisplayBounds: readonly DragRect[],
  edge: OrbSnapEdge,
  orbY: number,
  orbHeight: number,
  hiddenDepth: number,
): boolean {
  if (!Number.isFinite(hiddenDepth) || hiddenDepth <= 0) return false;
  const physicalEdgeAvailable =
    edge === "left"
      ? workArea.x === displayBounds.x
      : workArea.x + workArea.width === displayBounds.x + displayBounds.width;
  if (!physicalEdgeAvailable) return false;

  const hiddenRect: DragRect = {
    x: edge === "left" ? workArea.x - hiddenDepth : workArea.x + workArea.width,
    y: orbY,
    width: hiddenDepth,
    height: orbHeight,
  };
  return !otherDisplayBounds.some((candidate) => rectanglesOverlap(hiddenRect, candidate));
}

function rectanglesOverlap(left: DragRect, right: DragRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
