/**
 * AutoSurfaceWatcher — D-3 切片 1 的自动 surface 切换调度器。
 *
 * 定时（默认 300ms，对齐 WPF modeTimer）轮询 ForegroundWindowAdapter，把进程名经
 * resolveSurfaceFromProcessName 解析成 SurfaceKind 或 "unchanged"，只在结果与上次不同
 * 时调 SurfaceWindowManager.showOnly。完整链路：
 *
 *   adapter.getForegroundProcess()
 *     → { kind:"ok", processName } → resolveSurfaceFromProcessName(name)
 *       → "unchanged"（shell）→ 跳过
 *       → SurfaceKind === lastResolved → 跳过（去抖）
 *       → SurfaceKind !== lastResolved → await showOnly(kind)，更新 lastResolved
 *     → { kind:"error" } → 保持当前 surface（P2-2：探针失败不误切 orb）
 *
 * P1-4（2026-07-23）：await showOnly 后再结束本轮 polling（manager 的 generation token
 * 保证并发 showOnly 以后发为准；watcher 不重叠发新请求）。
 *
 * 出错（adapter reject / showOnly reject）：console.error + 保留当前 surface，不停止轮询。
 */
import type { SurfaceWindowManager } from "./manager.js";
import type { ForegroundWindowAdapter } from "./foreground.js";
import { resolveSurfaceFromProcessName } from "../../shared/desktop.js";
import type { SurfaceKind, SurfaceResolution } from "../../shared/desktop.js";

/** WPF modeTimer.Interval = 300ms。 */
const DEFAULT_INTERVAL_MS = 300;

/** 定时器抽象，便于测试注入假定时器。handle 为不透明值。 */
export interface AutoSurfaceScheduler {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** 默认调度器：包装全局 setInterval/clearInterval，返回 unref-able handle。 */
class GlobalAutoScheduler implements AutoSurfaceScheduler {
  setInterval(handler: () => void, ms: number): unknown {
    const handle = setInterval(handler, ms) as ReturnType<typeof setInterval> & {
      unref?: () => void;
    };
    handle.unref?.();
    return handle;
  }
  clearInterval(handle: unknown): void {
    clearInterval(handle as ReturnType<typeof setInterval>);
  }
}

export interface AutoSurfaceWatcherOptions {
  intervalMs?: number;
  /** 初始 lastResolved。默认 "orb"。 */
  initialSurface?: SurfaceKind;
  /** 注入调度器，测试用假定时器。默认全局。 */
  scheduler?: AutoSurfaceScheduler;
}

export class AutoSurfaceWatcher {
  readonly #adapter: ForegroundWindowAdapter;
  readonly #windowManager: SurfaceWindowManager;
  readonly #intervalMs: number;
  readonly #scheduler: AutoSurfaceScheduler;
  #lastResolved: SurfaceKind;
  #timer: unknown = null;
  #polling = false;

  constructor(
    adapter: ForegroundWindowAdapter,
    windowManager: SurfaceWindowManager,
    options: AutoSurfaceWatcherOptions = {},
  ) {
    this.#adapter = adapter;
    this.#windowManager = windowManager;
    this.#intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.#lastResolved = options.initialSurface ?? "orb";
    this.#scheduler = options.scheduler ?? new GlobalAutoScheduler();
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = this.#scheduler.setInterval(() => {
      void this.#pollOnce();
    }, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer) {
      this.#scheduler.clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** 当前去抖基线。测试/诊断用。 */
  get lastResolvedSurface(): SurfaceKind {
    return this.#lastResolved;
  }

  async #pollOnce(): Promise<void> {
    // 重入保护：上一轮（含 await showOnly）未完则跳过。
    if (this.#polling) return;
    this.#polling = true;
    try {
      const result = await this.#adapter.getForegroundProcess();
      // P2-2：探针失败保持当前 surface，不误切 orb。
      if (result.kind === "error") return;
      const resolution = resolveSurfaceFromProcessName(result.processName);
      await this.#applyResolution(resolution);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[auto-surface] poll failed: ${message}`);
    } finally {
      this.#polling = false;
    }
  }

  /**
   * 应用解析结果。**await showOnly 后再返回**（P1-4：让 manager generation token 生效，
   * 不与本 watcher 下一轮或其它来源的 showOnly 重叠到不可控）。
   */
  async #applyResolution(resolution: SurfaceResolution): Promise<void> {
    if (resolution === "unchanged") return;
    if (resolution === this.#lastResolved) return;
    const next = resolution;
    try {
      const result = await this.#windowManager.showOnly(next);
      // P1（本轮）：仅当实际应用（未被更新的 showOnly 抢占）才更新去抖基线。
      // 被抢占（applied=false）时保持旧 lastResolved，下一轮会重新尝试（resolution !== lastResolved）。
      if (result.applied) {
        this.#lastResolved = next;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[auto-surface] showOnly(${next}) failed: ${message}`);
      // 不更新 lastResolved：下一轮会重试同一个 target。
    }
  }
}
