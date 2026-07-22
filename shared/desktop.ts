export const surfaceKinds = ["card", "indicator-bar", "orb", "edge-capsule"] as const;

export type SurfaceKind = (typeof surfaceKinds)[number];

/**
 * 校验 showSurface IPC payload 是否合法（只接受 surfaceKinds 中的字符串值）。
 * 纯函数，便于在 Node 测试中覆盖非法输入（伪造/类型错误）。
 * 返回 null 表示非法（调用方应忽略），返回 SurfaceKind 表示合法。
 */
export function validateSurfaceKind(kind: unknown): SurfaceKind | null {
  if (typeof kind !== "string") return null;
  return surfaceKinds.includes(kind as SurfaceKind) ? (kind as SurfaceKind) : null;
}

export type SystemTheme = "light" | "dark";

export type DesktopPlatform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

export interface DesktopContext {
  platform: DesktopPlatform;
  surface: SurfaceKind;
  systemTheme: SystemTheme;
}

/**
 * Card 客户端类型，决定 Card 窗口尺寸（codex 576×404，zcode 576×333）。
 * 用户在 CardHeader 切换客户端时，主进程据此 resize BrowserWindow。
 */
export type CardClientKind = "codex" | "zcode";

export interface MonitorDesktopApi {
  getContext(): Promise<DesktopContext>;
  getUsage(): Promise<MultiClientSnapshot>;
  refreshUsage(): Promise<MultiClientSnapshot>;
  onSystemThemeChange(listener: (theme: SystemTheme) => void): () => void;
  /**
   * 通知主进程 Card 窗口切换尺寸（codex → 576×404，zcode → 576×333）。
   * 单向命令（ipcRenderer.send），无返回值。renderer 在 client.kind 变化时调用。
   */
  resizeCardWindow(kind: CardClientKind): void;
  /**
   * 通知主进程切换显示的 surface（如 edge-capsule 收起 → orb）。
   * 单向命令（ipcRenderer.send），无返回值。主进程调 SurfaceWindowManager.showOnly
   * 显示目标 surface 并隐藏其余（不销毁，便于再次展开）。
   */
  showSurface(kind: SurfaceKind): void;
}
import type { MultiClientSnapshot } from "../server/types.js";

export type { MultiClientSnapshot };
