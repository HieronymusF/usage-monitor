/**
 * HoverProbe — 通过长驻 ProbeDaemon 取光标+窗口几何，调纯函数判断命中（D-3 切片 2）。
 *
 * 性能修复（2026-07-23）：不再每次探针都 spawn powershell.exe（实测 ~528ms/次），
 * 改为复用长驻 ProbeDaemon（每次 ~1-5ms）。满足 80ms hover 轮询。
 *
 * 设计：守护进程只输出 raw 几何（cursor 坐标 + 窗口 DWM bounds + DPI），所有几何判断
 * 逻辑在 shared/hover-geometry.ts 的纯函数里（100% CI 可测）。
 *
 * 稳定性：任何失败降级为未命中且无点击（保守：不确定就不切换，避免误触）。
 */
import type { BrowserWindow } from "electron";
import { isPointerOverSurface } from "../../shared/hover-geometry.js";
import type { ProbeDaemon } from "./probe-daemon.js";

export interface HoverProbeOptions {
  /** 共享的长驻守护进程（由 main.ts 创建单例）。 */
  daemon: ProbeDaemon;
}

export interface HoverPointerState {
  over: boolean;
  primaryButtonPressed: boolean;
}

export class HoverProbe {
  readonly #daemon: ProbeDaemon;

  constructor(options: HoverProbeOptions) {
    this.#daemon = options.daemon;
  }

  /** 读取窗口命中状态与全局左键事件位。失败时保守返回未命中、未点击。 */
  async readPointerState(
    window: BrowserWindow,
    kind: "orb" | "edge-capsule",
  ): Promise<HoverPointerState> {
    const fallback: HoverPointerState = { over: false, primaryButtonPressed: false };
    if (window.isDestroyed()) return fallback;
    const hwnd = readHwndDecimal(window);
    if (hwnd === null) return fallback;

    const geometry = await this.#daemon.getHoverGeometry(hwnd);
    if (geometry === null) return fallback;
    return {
      over: isPointerOverSurface(geometry, kind),
      primaryButtonPressed: geometry.primaryButtonPressed,
    };
  }

  /** 兼容只关心 hover 的调用方。 */
  async isPointerOver(window: BrowserWindow, kind: "orb" | "edge-capsule"): Promise<boolean> {
    return (await this.readPointerState(window, kind)).over;
  }
}

/**
 * 把 BrowserWindow.getNativeWindowHandle() 的 Buffer 读成十进制字符串。
 * Windows 上是 HWND（64 位指针），BigInt 安全转十进制传给守护进程 hover 命令。
 */
function readHwndDecimal(window: BrowserWindow): string | null {
  try {
    const buf = window.getNativeWindowHandle();
    // 小端序指针：读成无符号整数。noUncheckedIndexedAccess 下 buf[i] 是 number|undefined。
    let value = 0n;
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      if (byte === undefined) continue;
      value += BigInt(byte) << (8n * BigInt(i));
    }
    if (value === 0n) return null;
    return value.toString();
  } catch {
    return null;
  }
}
