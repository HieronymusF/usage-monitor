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

/**
 * 自动模式下前台进程名解析的结果。
 * - `SurfaceKind`：应切换到的 surface。
 * - `"unchanged"`：保持当前 surface（典型：前台是 shell，WPF 对 powershell/pwsh 静默 bail）。
 */
export type SurfaceResolution = SurfaceKind | "unchanged";

/** 前台进程名 → 自动 surface 映射的白名单（小写）。来源：WPF Update-AutoMode + 产品要求 §8.1。 */
const CARD_PROCESSES = new Set(["codex", "chatgpt"]);
const BAR_PROCESSES = new Set(["zcode", "code", "cursor", "windsurf"]);
/** 切到这些 shell 时不切换 surface（避免在终端里来回跳）。 */
const SHELL_PROCESSES = new Set(["powershell", "pwsh"]);

/**
 * 把前台进程名解析成自动模式下应显示的 surface。
 * 纯函数（无 Windows API），可在 CI 中测五类输入。
 *
 * 规则（与 WPF companion/CodexUsageMonitor.ps1 Update-AutoMode 对齐）：
 * - `codex` / `chatgpt` → `card`
 * - `zcode` / `code` / `cursor` / `windsurf` → `indicator-bar`
 * - `powershell` / `pwsh` → `"unchanged"`（shell，保持当前，不跳）
 * - 其他（含 null / 空串 / 未知名）→ `orb`
 *
 * 进程名大小写不敏感（与 WPF ToLowerInvariant 对齐）。
 */
export function resolveSurfaceFromProcessName(name: string | null): SurfaceResolution {
  if (name === null) return "orb";
  const normalized = name.toLowerCase();
  if (normalized === "") return "orb";
  if (SHELL_PROCESSES.has(normalized)) return "unchanged";
  if (CARD_PROCESSES.has(normalized)) return "card";
  if (BAR_PROCESSES.has(normalized)) return "indicator-bar";
  return "orb";
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
  /**
   * D-3 切片 3：拖动中把 Orb 移到 (x, y)（DIP）。单向命令，renderer pointermove 节流调用。
   * P1-3：只操作 Orb 窗口（非"当前可见窗口"）。
   */
  moveOrb(x: number, y: number): void;
  /**
   * D-3 切片 3：拖动结束，主进程把 Orb 吸附到所在显示器最近的左/右边缘。单向命令。
   * P1-3：只操作 Orb 窗口。
   */
  dragOrbEnd(): void;
  /**
   * D-3 切片 3：取 Orb 窗口的 bounds（DIP）。拖动起点用。返回 null 表示 Orb 不可用。
   * P1-3：只返 Orb bounds（非"当前可见窗口"）。
   */
  getOrbBounds(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  /**
   * P1-1：暂停 hover 展开（拖动 pointerdown 时调）。单向命令。清 hover dwell，
   * resume 后必须等鼠标真正离开 Orb 一次才能重新展开。
   */
  suspendHover(): void;
  /**
   * P1-1：恢复 hover（拖动 pointerup 时调）。单向命令。不立即展开——等首次 not-over。
   */
  resumeHover(): void;
}
import type { MultiClientSnapshot } from "../server/types.js";

export type { MultiClientSnapshot };
