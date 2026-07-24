/**
 * 窗口位置持久化的纯函数（Milestone H 切片 3）。
 *
 * Electron screen / BrowserWindow 使用 DIP。settings 不保存跨机器不稳定的绝对屏幕坐标，
 * 而是保存相对目标显示器 workArea 左上角的 offset；恢复时按当前 workArea 重新计算并 clamp。
 * Orb/Capsule 额外保存左右吸附边，分辨率、任务栏或 DPI 改变后仍保持贴边。
 */
import { surfaceKinds, type SurfaceKind } from "./desktop.js";

export const WINDOW_EDGE_MARGIN_DIP = 6;

export type WindowSnapEdge = "left" | "right";

export interface WindowPlacement {
  /** Electron Display.id 的字符串形式。 */
  displayId: string;
  /** 相对 display.workArea.x 的 DIP 偏移。 */
  offsetX: number;
  /** 相对 display.workArea.y 的 DIP 偏移。 */
  offsetY: number;
  /** null 表示自由位置；left/right 表示恢复时强制贴对应边。 */
  snapEdge: WindowSnapEdge | null;
}

export type WindowPlacements = Record<SurfaceKind, WindowPlacement | null>;

export interface PlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacementDisplay {
  id: string;
  workArea: PlacementRect;
}

export interface ResolvedWindowPosition {
  x: number;
  y: number;
  /** 实际用于恢复的显示器；原显示器断开时可能与 placement.displayId 不同。 */
  displayId: string;
}

export function createDefaultWindowPlacements(): WindowPlacements {
  return {
    card: null,
    "indicator-bar": null,
    orb: null,
    "edge-capsule": null,
  };
}

export const DEFAULT_WINDOW_PLACEMENTS: WindowPlacements = createDefaultWindowPlacements();

/** 单条 placement 的运行时校验。非法输入返回 null。 */
export function normalizeWindowPlacement(input: unknown): WindowPlacement | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.displayId !== "string" || value.displayId.trim() === "") return null;
  if (!Number.isFinite(value.offsetX) || !Number.isFinite(value.offsetY)) return null;
  if (value.snapEdge !== null && value.snapEdge !== "left" && value.snapEdge !== "right") {
    return null;
  }
  return {
    displayId: value.displayId.trim(),
    offsetX: Math.round(value.offsetX as number),
    offsetY: Math.round(value.offsetY as number),
    snapEdge: value.snapEdge as WindowSnapEdge | null,
  };
}

/**
 * 校验完整 per-surface map。单个 surface 损坏只清空该项，不丢其他位置。
 * 多余 key 被忽略，避免 renderer/手工 JSON 注入非 surface 数据。
 */
export function validateWindowPlacements(input: unknown): WindowPlacements {
  const result = createDefaultWindowPlacements();
  if (typeof input !== "object" || input === null || Array.isArray(input)) return result;
  const value = input as Record<string, unknown>;
  for (const kind of surfaceKinds) {
    result[kind] = normalizeWindowPlacement(value[kind]);
  }
  return result;
}

/** 把当前绝对 bounds 转成相对显示器 workArea 的持久化数据。 */
export function captureWindowPlacement(
  bounds: PlacementRect,
  display: PlacementDisplay,
  snapEdge: WindowSnapEdge | null,
): WindowPlacement {
  return {
    displayId: display.id,
    offsetX: Math.round(bounds.x - display.workArea.x),
    offsetY: Math.round(bounds.y - display.workArea.y),
    snapEdge,
  };
}

/**
 * 从当前几何判断是否已经贴在 workArea 左/右边。
 * tolerance 吸收 Electron/DPI 四舍五入产生的 1 DIP 偏差。
 */
export function inferWindowSnapEdge(
  bounds: PlacementRect,
  workArea: PlacementRect,
  margin = WINDOW_EDGE_MARGIN_DIP,
  tolerance = 1,
): WindowSnapEdge | null {
  const left = workArea.x + margin;
  const right = workArea.x + workArea.width - bounds.width - margin;
  if (Math.abs(bounds.x - left) <= tolerance) return "left";
  if (Math.abs(bounds.x - right) <= tolerance) return "right";
  return null;
}

/**
 * 按当前显示器 topology 恢复位置。
 * displays[0] 必须由调用方放主显示器；原 displayId 不存在时用它回退，确保窗口不留在断开的屏幕。
 */
export function resolveWindowPlacement(
  placement: WindowPlacement,
  size: Pick<PlacementRect, "width" | "height">,
  displays: readonly PlacementDisplay[],
  margin = WINDOW_EDGE_MARGIN_DIP,
): ResolvedWindowPosition | null {
  if (displays.length === 0) return null;
  const display = displays.find((candidate) => candidate.id === placement.displayId) ?? displays[0];
  if (!display) return null;
  const workArea = display.workArea;

  let desiredX = workArea.x + placement.offsetX;
  if (placement.snapEdge === "left") desiredX = workArea.x + margin;
  if (placement.snapEdge === "right") {
    desiredX = workArea.x + workArea.width - size.width - margin;
  }
  const desiredY = workArea.y + placement.offsetY;
  const x = clampWindowAxis(desiredX, workArea.x, workArea.width, size.width, margin);
  const y = clampWindowAxis(desiredY, workArea.y, workArea.height, size.height, margin);
  return { x, y, displayId: display.id };
}

/**
 * 形态切换时沿用当前窗口的右下锚点，并 clamp 到同一显示器。
 * 已知 snapEdge 时强制保持同一边，避免左侧 Capsule 收起成 Orb 后跑到窗口右下角。
 */
export function anchorWindowToSource(
  sourceBounds: PlacementRect,
  targetSize: Pick<PlacementRect, "width" | "height">,
  workArea: PlacementRect,
  snapEdge: WindowSnapEdge | null = null,
  margin = WINDOW_EDGE_MARGIN_DIP,
): { x: number; y: number } {
  let desiredX = sourceBounds.x + sourceBounds.width - targetSize.width;
  if (snapEdge === "left") desiredX = workArea.x + margin;
  if (snapEdge === "right") {
    desiredX = workArea.x + workArea.width - targetSize.width - margin;
  }
  const desiredY = sourceBounds.y + sourceBounds.height - targetSize.height;
  return {
    x: clampWindowAxis(desiredX, workArea.x, workArea.width, targetSize.width, margin),
    y: clampWindowAxis(desiredY, workArea.y, workArea.height, targetSize.height, margin),
  };
}

export function sameWindowPlacement(
  left: WindowPlacement | null,
  right: WindowPlacement | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.displayId === right.displayId &&
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.snapEdge === right.snapEdge
  );
}

function clampWindowAxis(
  desired: number,
  workAreaStart: number,
  workAreaLength: number,
  windowLength: number,
  margin: number,
): number {
  const min = workAreaStart + margin;
  const max = workAreaStart + workAreaLength - windowLength - margin;
  // 窗口比可用工作区还大时从 workArea 起点显示，不能反向 clamp 到负区间。
  if (max < min) return Math.round(workAreaStart);
  return Math.round(Math.max(min, Math.min(max, desired)));
}
