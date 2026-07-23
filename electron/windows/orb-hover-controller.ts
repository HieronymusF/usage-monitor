/**
 * OrbHoverController — D-3 切片 2 的 hover 展开/收起状态机。
 *
 * 80ms probe 轮询当前可见窗口的命中状态，按延迟切换 orb ↔ edge-capsule：
 *
 *   collapsed(orb 可见)
 *     └─[probe over 连续 220ms]→ showOnly("edge-capsule")
 *   expanded(capsule 可见)
 *     └─[probe not-over 连续 420ms]→ showOnly("orb")
 *
 * 为什么 probe 不用 renderer mouseenter/mouseleave：Electron setIgnoreMouseEvents toggle
 * 触发合成 enter/leave 死循环（#49982），forward:true 在其他 app 抢焦点时失效（#33281）。
 * 照搬 WPF 的 80ms probe 方案（GetCursorPos + DWM bounds + 胶囊几何）。
 *
 * 计时：用注入的 now() 测**实际经过时间**（now - dwellStartedAt >= delay），不累加 probeMs。
 *
 * 协调（2026-07-23 修复 P1-1 / P2-1）：
 * - **suspend()/resume()**：拖动期间 renderer 调 suspend 暂停 hover + 清 dwell；
 *   resume 后**必须等 probe 首次返回 not-over**（鼠标真正离开 Orb 一次）才重新允许展开，
 *   避免拖动结束后鼠标仍在 Orb 上立即触发 hover。
 * - **onSurfaceChanged(kind)**：manager 的 surface 变更监听器调此同步内部 state。
 *   renderer click → showSurface("edge-capsule") → manager 通知 → controller state=expanded，
 *   这样点击后立即移开鼠标也能进 expanded 的离开计时分支，420ms 后收起（P2-1）。
 * - 与 AutoSurfaceWatcher：本 controller 展开不改 watcher 的 lastResolved（前台不变
 *   debounce 不打断；前台变 watcher 正常切，合理打断 hover）。
 */
import type { BrowserWindow } from "electron";
import type { SurfaceWindowManager } from "./manager.js";
import type { HoverProbe } from "./hover-probe.js";
import type { SurfaceKind } from "../../shared/desktop.js";

/** WPF OrbHoverProbeTimer.Interval = 80ms。 */
const DEFAULT_PROBE_MS = 80;

export interface OrbHoverControllerOptions {
  probeMs?: number;
  expandDelayMs?: number; // 默认 motion.hoverExpandDelayMs = 220
  collapseDelayMs?: number; // 默认 motion.leaveCollapseDelayMs = 420
  /** reduced-motion 时延迟置 0（立即切换）。默认 true。 */
  respectReducedMotion?: boolean;
  /** 注入的时间源，测试确定性。生产默认 Date.now。 */
  now?: () => number;
  /** 注入的 setInterval/clearInterval，测试用假定时器。 */
  scheduler?: OrbScheduler;
}

/** 定时器抽象，便于测试注入假定时器。handle 为不透明值，由 scheduler 解释。 */
export interface OrbScheduler {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

type HoverState = "collapsed" | "expanded";

/** 默认调度器：包装全局 setInterval/clearInterval，返回 unref-able handle。 */
class GlobalScheduler implements OrbScheduler {
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

export class OrbHoverController {
  readonly #windowManager: SurfaceWindowManager;
  readonly #hoverProbe: HoverProbe;
  readonly #probeMs: number;
  readonly #expandDelayMs: number;
  readonly #collapseDelayMs: number;
  readonly #respectReducedMotion: boolean;
  readonly #now: () => number;
  readonly #scheduler: OrbScheduler;
  #timer: unknown = null;
  #state: HoverState = "collapsed";
  /** 当前 dwell 起始时间戳。null=未在 dwell。 */
  #dwellStartedAt: number | null = null;
  #probing = false;
  /** P1-1：是否被外部 suspend（拖动期间）。suspend 期间不展开。 */
  #suspended = false;
  /**
   * P1-1：resume 后必须等 probe 首次返回 not-over 才允许展开。
   * 避免拖动结束鼠标仍在 Orb 上立即 hover 展开。初始 false（启动即可展开）。
   */
  #requireLeaveBeforeExpand = false;
  /**
   * P1（本轮）：展开 cancel token（独立于 suspended，resume 不重置）。
   * 每次 suspend() 自增。pending 展开捕获此值，完成后若已变（被 cancel）则**丢弃**该展开
   * （不 state=expanded）。resume 不重置此 token——一旦取消就永久失效（旧 pending 不能因
   * resume 重新有效）。靠 manager 的 generation token 让 suspend 主动发的 showOnly("orb")
   * 覆盖 pending 的 showOnly("edge-capsule")（后发为准）。
   */
  #expandCancelToken = 0;

  constructor(
    windowManager: SurfaceWindowManager,
    hoverProbe: HoverProbe,
    options: OrbHoverControllerOptions = {},
  ) {
    this.#windowManager = windowManager;
    this.#hoverProbe = hoverProbe;
    this.#probeMs = options.probeMs ?? DEFAULT_PROBE_MS;
    this.#expandDelayMs = options.expandDelayMs ?? 220;
    this.#collapseDelayMs = options.collapseDelayMs ?? 420;
    this.#respectReducedMotion = options.respectReducedMotion ?? true;
    this.#now = options.now ?? (() => Date.now());
    this.#scheduler = options.scheduler ?? new GlobalScheduler();
  }

  start(): void {
    if (this.#timer) return;
    this.#state =
      this.#windowManager.getVisibleSurface() === "edge-capsule" ? "expanded" : "collapsed";
    this.#dwellStartedAt = null;
    this.#suspended = false;
    this.#requireLeaveBeforeExpand = false;
    this.#timer = this.#scheduler.setInterval(() => {
      void this.#probeOnce();
    }, this.#probeMs);
  }

  stop(): void {
    if (this.#timer) {
      this.#scheduler.clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#dwellStartedAt = null;
    this.#suspended = false;
    this.#requireLeaveBeforeExpand = false;
  }

  /** 当前状态。测试/诊断用。 */
  get state(): HoverState {
    return this.#state;
  }

  /**
   * P1-1：暂停 hover（拖动 pointerdown 时调）。清 dwell，suspend 期间不展开。
   * P1（本轮）：使**已发出但未完成**的 hover showOnly(edge-capsule) 失效——若展开请求
   * 仍在 pending（EdgeCapsule 首次创建/load 慢），其 .then 检测到 expandGeneration 已变，
   * 立即 showOnly("orb") 回滚（不让 Orb 在拖动中被隐藏）。
   * resume() 后必须等鼠标真正离开 Orb 一次才能重新展开。
   */
  suspend(): void {
    this.#suspended = true;
    this.#dwellStartedAt = null;
    this.#requireLeaveBeforeExpand = true;
    // P1（本轮）：使任何 pending 展开永久失效（resume 不重置 token）。
    this.#expandCancelToken++;
    // suspend = 回到 orb 基线：立即把 state 设 collapsed（pending 展开的 .then 见 token 变了
    // 不会改 state，所以这里设的 collapsed 不会被它覆盖）。
    this.#state = "collapsed";
    // 主动发 showOnly("orb") 抢占 pending 的 showOnly("edge-capsule")。
    // manager 的 generation token 保证这个后发的 orb 覆盖先发的 capsule（后发为准）。
    void this.#windowManager.showOnly("orb").catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[hover] suspend showOnly(orb) failed: ${message}`);
    });
  }

  /**
   * P1-1：恢复 hover（拖动 pointerup 时调）。不立即展开——必须等 probe 首次 not-over。
   */
  resume(): void {
    this.#suspended = false;
    // #requireLeaveBeforeExpand 保持 true，由 probeOnce 在收到 not-over 时清零。
  }

  /**
   * P2-1：surface 变更通知（manager.onSurfaceChange 调）。
   * click → showSurface("edge-capsule") → manager 通知 → state=expanded，
   * 这样点击后移开鼠标能进 expanded 的离开计时分支。
   * 切到非 orb/capsule（card/bar）→ collapsed 基线（不打断，watcher 已处理）。
   */
  onSurfaceChanged(kind: SurfaceKind): void {
    if (kind === "edge-capsule") {
      this.#state = "expanded";
      this.#dwellStartedAt = null;
    } else if (kind === "orb") {
      this.#state = "collapsed";
      this.#dwellStartedAt = null;
    }
    // card/indicator-bar：不改 state（watcher 主导，hover 静默）。
  }

  async #probeOnce(): Promise<void> {
    if (this.#probing) return;
    this.#probing = true;
    try {
      const visible = this.#windowManager.getVisibleSurface();
      if (visible !== "orb" && visible !== "edge-capsule") {
        this.#dwellStartedAt = null;
        return;
      }
      const window = this.#windowManager.getVisibleWindow();
      if (!window) {
        this.#dwellStartedAt = null;
        return;
      }
      const over = await this.#probeWindow(window, visible);
      this.#advance(over);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[hover] probe failed: ${message}`);
    } finally {
      this.#probing = false;
    }
  }

  async #probeWindow(window: BrowserWindow, visible: "orb" | "edge-capsule"): Promise<boolean> {
    return this.#hoverProbe.isPointerOver(window, visible);
  }

  /**
   * 根据命中状态推进状态机（用实测经过时间）。
   * P1-1：suspend 期间不展开。resume 后 requireLeaveBeforeExpand 时，collapsed 态收到
   * not-over 才清 requireLeaveBeforeExpand（确认鼠标已离开），之后 over 才能累计 dwell。
   */
  #advance(over: boolean): void {
    const expandDelay = this.#effectiveDelay(this.#expandDelayMs);
    const collapseDelay = this.#effectiveDelay(this.#collapseDelayMs);
    const now = this.#now();

    if (this.#state === "collapsed") {
      // P1-1：suspend 期间不展开。
      if (this.#suspended) {
        this.#dwellStartedAt = null;
        return;
      }
      // P1-1：resume 后必须先收到一次 not-over（确认离开 Orb）才允许展开。
      if (this.#requireLeaveBeforeExpand) {
        if (!over) {
          this.#requireLeaveBeforeExpand = false;
        }
        this.#dwellStartedAt = null;
        return;
      }
      if (over) {
        if (this.#dwellStartedAt === null) this.#dwellStartedAt = now;
        if (now - this.#dwellStartedAt >= expandDelay) {
          this.#switchTo("expanded", "edge-capsule");
        }
      } else {
        this.#dwellStartedAt = null;
      }
    } else {
      // expanded
      if (!over) {
        if (this.#dwellStartedAt === null) this.#dwellStartedAt = now;
        if (now - this.#dwellStartedAt >= collapseDelay) {
          this.#switchTo("collapsed", "orb");
        }
      } else {
        this.#dwellStartedAt = null;
      }
    }
  }

  #switchTo(newState: HoverState, target: "orb" | "edge-capsule"): void {
    this.#state = newState;
    this.#dwellStartedAt = null;
    // P1（本轮）：展开捕获 cancel token。**新合法展开也自增 token**（使之前的 pending 展开
    // 知道自己已过时）。pending 展开完成后若 token 已变（被 suspend 或被更新的展开取代），
    // **不修改 state**（既不展开也不回滚）——让 suspend 的抢占或新展开的 state 生效。
    // 收起（→ orb）无需此保护。
    const isExpand = target === "edge-capsule";
    if (isExpand) this.#expandCancelToken++;
    const myToken = this.#expandCancelToken;
    this.#windowManager
      .showOnly(target)
      .then(() => {
        // token 已变：本展开已过时（被 suspend 取消 或 被更新展开取代）。不触碰 state。
        if (isExpand && this.#expandCancelToken !== myToken) return;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[hover] showOnly(${target}) failed: ${message}`);
        // 仅在本展开仍是当前代时才回滚 state。
        if (!isExpand || this.#expandCancelToken === myToken) {
          this.#state = newState === "expanded" ? "collapsed" : "expanded";
        }
      });
  }

  #effectiveDelay(baseDelayMs: number): number {
    if (this.#respectReducedMotion && this.#isReducedMotion()) return 0;
    return baseDelayMs;
  }

  #isReducedMotion(): boolean {
    // TODO（切片后续）：接 SystemParametersInfo(SPI_GETCLIENTAREAANIMATION) 或 renderer matchMedia。
    return false;
  }
}
