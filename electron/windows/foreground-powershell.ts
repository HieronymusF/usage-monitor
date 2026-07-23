/**
 * PowerShellForegroundWindowAdapter — Windows 平台的前台窗口检测实现（D-3 切片 1）。
 *
 * 性能修复（2026-07-23）：复用长驻 ProbeDaemon（启动一次 spawn + Add-Type，后续每次探针
 * ~1-5ms stdin/stdout 往返）。满足 300ms 轮询。
 *
 * 红线 / 稳定性：
 * - 守护进程返回可判别结果（ok/error）。error 时 watcher 保持当前 surface（P2-2）。
 * - 只解析 processName 字段；守护进程也只输出 processName（无 PID/路径/标题）。
 */
import type { ForegroundProbeResult, ForegroundWindowAdapter } from "./foreground.js";
import type { ProbeDaemon } from "./probe-daemon.js";

export interface PowerShellForegroundWindowAdapterOptions {
  /** 共享的长驻守护进程（由 main.ts 创建单例）。 */
  daemon: ProbeDaemon;
}

export class PowerShellForegroundWindowAdapter implements ForegroundWindowAdapter {
  readonly #daemon: ProbeDaemon;

  constructor(options: PowerShellForegroundWindowAdapterOptions) {
    this.#daemon = options.daemon;
  }

  async getForegroundProcess(): Promise<ForegroundProbeResult> {
    return this.#daemon.getForegroundProcess();
  }
}
