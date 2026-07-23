/**
 * HoverProbe — 通过长驻 ProbeDaemon 取光标+窗口几何，调纯函数判断命中（D-3 切片 2）。
 *
 * 性能修复（2026-07-23）：不再每次探针都 spawn powershell.exe（实测 ~528ms/次），
 * 改为复用长驻 ProbeDaemon（每次 ~1-5ms）。满足 80ms hover 轮询。
 *
 * 设计：守护进程只输出 raw 几何（cursor 坐标 + 窗口 DWM bounds + DPI），所有几何判断
 * 逻辑在 shared/hover-geometry.ts 的纯函数里（100% CI 可测）。
 *
 * 稳定性：任何失败降级 false（保守：不确定就不展开，避免误触）。
 */
import type { BrowserWindow } from "electron";
import { isPointerOverSurface } from "../../shared/hover-geometry.js";
import type { ProbeDaemon } from "./probe-daemon.js";

export interface HoverProbeOptions {
  /** 共享的长驻守护进程（由 main.ts 创建单例）。 */
  daemon: ProbeDaemon;
}

export class HoverProbe {
  readonly #daemon: ProbeDaemon;

  constructor(options: HoverProbeOptions) {
    this.#daemon = options.daemon;
  }

  /**
   * 判断光标是否在指定窗口的可见形状内。
   * @param window 目标 BrowserWindow（orb 或 edge-capsule）
   * @param kind 该窗口的 surface kind（决定用哪个几何判断函数）
   * @returns true=命中；false=未命中或探测失败（保守）
   */
  async isPointerOver(window: BrowserWindow, kind: "orb" | "edge-capsule"): Promise<boolean> {
    if (window.isDestroyed()) return false;
    const hwnd = readHwndDecimal(window);
    if (hwnd === null) return false;

    const geometry = await this.#daemon.getHoverGeometry(hwnd);
    if (geometry === null) return false;
    return isPointerOverSurface(geometry, kind);
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
