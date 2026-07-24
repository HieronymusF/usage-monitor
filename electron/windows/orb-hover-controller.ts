/**
 * OrbHoverController — 半隐藏 Orb / 完整贴边 Orb / 自由 Orb / EdgeCapsule 交互。
 *
 *   peek（半隐藏 Orb） --hover--> revealed（完整贴边 Orb）
 *   revealed --renderer click--> expanded（EdgeCapsule）
 *   revealed --窗口外左键或离开 1000ms--> peek
 *   Orb --drag--> floating（可停在任意位置）
 *   expanded --窗口外左键或离开 1000ms--> 原 Orb 位置（边缘时 peek，自由位置时 floating）
 *
 * renderer 的 useOrbDrag 继续负责 click 与 drag 区分；本控制器只处理全局 hover、
 * 窗口外点击和离开计时。80ms Windows probe 同时返回命中状态与左键事件位。
 */
import type { BrowserWindow } from "electron";
import type { SurfaceKind } from "../../shared/desktop.js";
import type { HoverPointerState, HoverProbe } from "./hover-probe.js";
import type { SurfaceWindowManager } from "./manager.js";

const DEFAULT_PROBE_MS = 80;
const DEFAULT_COLLAPSE_DELAY_MS = 1000;

export interface OrbHoverControllerOptions {
  probeMs?: number;
  collapseDelayMs?: number;
  now?: () => number;
  scheduler?: OrbScheduler;
}

export interface OrbScheduler {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

type HoverState = "peek" | "revealed" | "floating" | "expanded";

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
  readonly #collapseDelayMs: number;
  readonly #now: () => number;
  readonly #scheduler: OrbScheduler;
  #timer: unknown = null;
  #state: HoverState = "peek";
  #leaveStartedAt: number | null = null;
  #probing = false;
  #suspended = false;
  #collapsing = false;

  constructor(
    windowManager: SurfaceWindowManager,
    hoverProbe: HoverProbe,
    options: OrbHoverControllerOptions = {},
  ) {
    this.#windowManager = windowManager;
    this.#hoverProbe = hoverProbe;
    this.#probeMs = options.probeMs ?? DEFAULT_PROBE_MS;
    this.#collapseDelayMs = options.collapseDelayMs ?? DEFAULT_COLLAPSE_DELAY_MS;
    this.#now = options.now ?? (() => Date.now());
    this.#scheduler = options.scheduler ?? new GlobalScheduler();
  }

  start(): void {
    if (this.#timer) return;
    this.#state = this.#resolveVisibleState();
    this.#leaveStartedAt = null;
    this.#suspended = false;
    this.#collapsing = false;
    this.#timer = this.#scheduler.setInterval(() => {
      void this.#probeOnce();
    }, this.#probeMs);
  }

  stop(): void {
    if (this.#timer) {
      this.#scheduler.clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#leaveStartedAt = null;
    this.#suspended = false;
    this.#collapsing = false;
  }

  get state(): HoverState {
    return this.#state;
  }

  /** pointerdown 后保持完整 Orb，禁止离开计时与位置回藏干扰拖动。 */
  suspend(): void {
    this.#suspended = true;
    this.#leaveStartedAt = null;
  }

  /** pointerup 后恢复探针；边缘拖放进入 revealed，自由拖放进入 floating。 */
  resume(dragged = false): void {
    this.#suspended = false;
    this.#leaveStartedAt = null;
    if (dragged && this.#windowManager.getVisibleSurface() === "orb") {
      this.#state = this.#windowManager.isOrbWindowAtEdge() ? "revealed" : "floating";
    }
  }

  onSurfaceChanged(kind: SurfaceKind): void {
    if (kind === "edge-capsule") {
      this.#state = "expanded";
      this.#collapsing = false;
      this.#leaveStartedAt = null;
    } else if (kind === "orb") {
      this.#state = this.#resolveOrbState();
      this.#collapsing = false;
      this.#leaveStartedAt = null;
    }
  }

  async #probeOnce(): Promise<void> {
    if (this.#probing) return;
    const visible = this.#windowManager.getVisibleSurface();
    if (visible !== "orb" && visible !== "edge-capsule") {
      this.#leaveStartedAt = null;
      return;
    }
    const window = this.#windowManager.getVisibleWindow();
    if (!window) {
      this.#leaveStartedAt = null;
      return;
    }

    this.#probing = true;
    try {
      const sample = await this.#probeWindow(window, visible);
      this.#advance(sample);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[hover] probe failed: ${message}`);
    } finally {
      this.#probing = false;
    }
  }

  async #probeWindow(
    window: BrowserWindow,
    visible: "orb" | "edge-capsule",
  ): Promise<HoverPointerState> {
    return this.#hoverProbe.readPointerState(window, visible);
  }

  #advance(sample: HoverPointerState): void {
    if (this.#suspended) {
      this.#leaveStartedAt = null;
      return;
    }

    if (this.#state === "peek") {
      this.#leaveStartedAt = null;
      if (sample.over) {
        this.#windowManager.revealOrbWindow();
        this.#state = "revealed";
      }
      return;
    }

    if (this.#state === "floating") {
      this.#leaveStartedAt = null;
      return;
    }

    if (sample.over) {
      this.#leaveStartedAt = null;
      return;
    }

    if (sample.primaryButtonPressed) {
      this.#collapseToPeek();
      return;
    }

    const now = this.#now();
    if (this.#leaveStartedAt === null) this.#leaveStartedAt = now;
    if (now - this.#leaveStartedAt >= this.#collapseDelayMs) this.#collapseToPeek();
  }

  #collapseToPeek(): void {
    this.#leaveStartedAt = null;
    if (this.#state === "revealed") {
      this.#windowManager.concealOrbWindow();
      this.#state = "peek";
      return;
    }
    if (this.#state !== "expanded" || this.#collapsing) return;

    this.#collapsing = true;
    this.#windowManager
      .showOnly("orb")
      .then((result) => {
        this.#collapsing = false;
        if (result.applied) this.#state = this.#resolveOrbState();
      })
      .catch((error: unknown) => {
        this.#collapsing = false;
        this.#state = "expanded";
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[hover] showOnly(orb) failed: ${message}`);
      });
  }

  #resolveVisibleState(): HoverState {
    const visible = this.#windowManager.getVisibleSurface();
    if (visible === "edge-capsule") return "expanded";
    if (visible === "orb") return this.#resolveOrbState();
    return "peek";
  }

  #resolveOrbState(): "peek" | "floating" {
    return this.#windowManager.isOrbWindowAtEdge() ? "peek" : "floating";
  }
}
