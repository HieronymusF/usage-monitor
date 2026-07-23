import { BrowserWindow, screen } from "electron";
import { fileURLToPath } from "node:url";
import type { SurfaceKind } from "../../shared/desktop.js";
import { snapOrbToEdge } from "../../shared/orb-drag.js";
import { cardWindowSpec } from "./card.js";
import { edgeCapsuleWindowSpec } from "./edge-capsule.js";
import { indicatorBarWindowSpec } from "./indicator-bar.js";
import { orbWindowSpec } from "./orb.js";
import type { SurfaceWindowSpec } from "./types.js";

const specs: Record<SurfaceKind, SurfaceWindowSpec> = {
  card: cardWindowSpec,
  "indicator-bar": indicatorBarWindowSpec,
  orb: orbWindowSpec,
  "edge-capsule": edgeCapsuleWindowSpec,
};

/** surface 变更监听器（P2-1：统一协调 OrbHoverController 状态）。 */
export type SurfaceChangeListener = (kind: SurfaceKind) => void;

/**
 * showOnly 的可判别结果（P1 修复）：调用方区分"实际应用"和"被更新请求抢占"。
 * - applied=true：显隐已执行（本请求是最新 generation）。
 * - applied=false：被更新的 showOnly 抢占（generation 已变，本请求未执行显隐）。
 *   调用方（如 AutoSurfaceWatcher）不应据此更新去抖基线，应保持旧值下轮重试。
 */
export interface ShowOnlyResult {
  window: BrowserWindow;
  applied: boolean;
}

export class SurfaceWindowManager {
  readonly #windows = new Map<SurfaceKind, BrowserWindow>();
  readonly #surfaceByWebContentsId = new Map<number, SurfaceKind>();
  /**
   * P1-4：showOnly 的 generation token。每次发起新 showOnly 自增；异步创建/加载窗口期间，
   * 若有更新的 showOnly 发出，旧的完成时检测到 generation 已变就放弃显隐，避免后发被先发覆盖。
   */
  #showOnlyGeneration = 0;
  /** P2-1：surface 变更监听器集合。showOnly 成功切换显隐后通知。 */
  readonly #surfaceChangeListeners = new Set<SurfaceChangeListener>();

  getSurfaceForWebContents(webContentsId: number): SurfaceKind | undefined {
    return this.#surfaceByWebContentsId.get(webContentsId);
  }

  /**
   * 取某个 surface 的 BrowserWindow。仅供工具/截图用途（main.ts CAPTURE_PREVIEW 分支）。
   * 生产路径不调用。
   */
  getBrowserWindow(kind: SurfaceKind): BrowserWindow | undefined {
    return this.#windows.get(kind);
  }

  /**
   * 当前可见（isVisible 且未销毁）的 surface kind。
   * 同一时间只有一个 surface 可见（showOnly 语义），返回第一个匹配的。
   * 用于 hover controller / watcher 协调：知道用户实际看到的是 orb 还是 edge-capsule。
   */
  getVisibleSurface(): SurfaceKind | undefined {
    for (const [kind, window] of this.#windows) {
      if (!window.isDestroyed() && window.isVisible()) return kind;
    }
    return undefined;
  }

  /**
   * 当前可见的 BrowserWindow（orb/edge-capsule/card/indicator-bar 之一）。
   * hover probe 用它取 HWND 做命中检测。
   */
  getVisibleWindow(): BrowserWindow | undefined {
    for (const window of this.#windows.values()) {
      if (!window.isDestroyed() && window.isVisible()) return window;
    }
    return undefined;
  }

  /** P2-1：注册 surface 变更监听器。返回取消注册函数。 */
  onSurfaceChange(listener: SurfaceChangeListener): () => void {
    this.#surfaceChangeListeners.add(listener);
    return () => {
      this.#surfaceChangeListeners.delete(listener);
    };
  }

  /** P2-1：通知所有监听器 surface 已变更。仅在 showOnly 成功显隐后调。 */
  #notifySurfaceChange(kind: SurfaceKind): void {
    for (const listener of this.#surfaceChangeListeners) {
      try {
        listener(kind);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[manager] surface change listener failed: ${message}`);
      }
    }
  }

  /**
   * D-3 切片 3（P1-3 修复）：取 Orb 窗口的 bounds（DIP）。拖动起点用。
   * 只返 Orb（不是"当前可见窗口"），避免拖动期间 surface 切换后 getOrbBounds 返错窗口。
   * Orb 未创建/已销毁/已隐藏 → null（renderer 应中止拖动）。
   */
  getOrbWindowBounds(): { x: number; y: number; width: number; height: number } | null {
    const window = this.#windows.get("orb");
    if (!window || window.isDestroyed()) return null;
    return window.getBounds();
  }

  /**
   * D-3 切片 3（P1-3 修复）：把 Orb 窗口移到 (x, y)（DIP）。
   * **只操作 orb BrowserWindow**，不是"当前可见窗口"。拖动期间若 Hover/Watcher 切了 surface，
   * 延迟到达的 moveOrb 不会移动 EdgeCapsule/Card/Bar。
   * Orb 未创建/已销毁/已隐藏 → 丢弃（延迟命令，窗口已不可拖）。
   */
  moveOrbWindow(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const window = this.#windows.get("orb");
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    window.setPosition(Math.round(x), Math.round(y));
  }

  /**
   * D-3 切片 3（P1-3 修复）：拖动结束后把 Orb 吸附到所在显示器最近的左/右边缘 + Y clamp。
   * **只操作 orb BrowserWindow**。Orb 未创建/已销毁/已隐藏 → 丢弃。
   */
  snapOrbWindowToEdge(): void {
    const window = this.#windows.get("orb");
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    const bounds = window.getBounds();
    const workArea = screen.getDisplayMatching(bounds).workArea;
    const target = snapOrbToEdge(
      { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
    );
    window.setPosition(target.x, target.y);
  }

  /**
   * 调整 Card 窗口尺寸到指定 client kind（codex 576×404，zcode 576×333）。
   * 用于用户切换 CardHeader 客户端时跟随 resize，避免 ZCode 在 404 高窗口里底部留白。
   *
   * setSize 在 frameless + transparent + resizable:false 窗口上仍可工作（Electron 43 验证）。
   * resizable:false 只禁止用户拖动 resize，程序化 setSize 不受限制。
   */
  resizeCardWindow(kind: "codex" | "zcode"): void {
    const card = this.#windows.get("card");
    if (!card || card.isDestroyed()) return;
    // 尺寸来自 surfaceSizes token（codex 576×404，zcode 576×333）。
    const { width, height } =
      kind === "zcode" ? { width: 576, height: 333 } : { width: 576, height: 404 };
    // setSize 在 frameless + transparent + resizable:false 上静默不生效（Electron #49173）。
    // 临时开 resizable，setSize，再恢复 resizable:false —— issue #49173 的已知 workaround。
    card.setResizable(true);
    card.setSize(width, height);
    card.setResizable(false);
  }

  /**
   * P1-4（generation token）：只允许最后一次 showOnly 请求真正执行显隐。
   * 较早的 showOnly 在 await getOrCreate（首次创建含 loadURL/loadFile 异步）期间，
   * 若有更新的请求发出（generation 自增），旧的完成时检测到 generation 已变就放弃显隐。
   * 这样并发/乱序完成时，最终可见 surface 一定以后发请求为准。
   */
  async showOnly(kind: SurfaceKind): Promise<ShowOnlyResult> {
    const myGeneration = ++this.#showOnlyGeneration;
    // v29：收起/展开时保持屏幕边缘位置（修复 Orb 跳主显示器）。
    const visibleOld = [...this.#windows.values()].find(
      (w) => !w.isDestroyed() && w.isVisible() && w !== this.#windows.get(kind),
    );
    const target = await this.#getOrCreate(kind);
    // P1-4：await 期间若有更新的 showOnly 发出，放弃本次显隐（让后发为准）。
    // P1（本轮）：返回 applied=false（非异常），让调用方区分"被抢占"和"实际应用"。
    if (myGeneration !== this.#showOnlyGeneration) {
      return { window: target, applied: false };
    }
    if (visibleOld) {
      const oldBounds = visibleOld.getBounds();
      const display = screen.getDisplayMatching(oldBounds);
      const wa = display.workArea;
      const [tw = 0, th = 0] = target.getContentSize();
      // anchor：旧窗口右下角对齐目标右下角；clamp 到同显示器 workArea，留 6px 边距
      const x = Math.max(
        wa.x + 6,
        Math.min(wa.x + wa.width - tw - 6, oldBounds.x + oldBounds.width - tw),
      );
      const y = Math.max(
        wa.y + 6,
        Math.min(wa.y + wa.height - th - 6, oldBounds.y + oldBounds.height - th),
      );
      target.setPosition(Math.round(x), Math.round(y));
    }
    for (const [candidateKind, window] of this.#windows) {
      if (candidateKind === kind) {
        window.showInactive();
      } else {
        window.hide();
      }
    }
    // P2-1：成功显隐后通知监听器（hover controller 同步状态）。
    this.#notifySurfaceChange(kind);
    return { window: target, applied: true };
  }

  closeAll(): void {
    for (const window of this.#windows.values()) {
      window.destroy();
    }
    this.#windows.clear();
    this.#surfaceByWebContentsId.clear();
  }

  async #getOrCreate(kind: SurfaceKind): Promise<BrowserWindow> {
    const existing = this.#windows.get(kind);
    if (existing && !existing.isDestroyed()) return existing;

    const spec = specs[kind];
    const window = new BrowserWindow({
      width: spec.width,
      height: spec.height,
      resizable: spec.resizable,
      ...spec.extraOptions,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: "#00000000",
      useContentSize: true,
      webPreferences: {
        preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.#windows.set(kind, window);
    const webContentsId = window.webContents.id;
    this.#surfaceByWebContentsId.set(webContentsId, kind);
    window.once("closed", () => {
      this.#windows.delete(kind);
      this.#surfaceByWebContentsId.delete(webContentsId);
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      url.searchParams.set("surface", kind);
      // 预览模式: CARD_PREVIEW=dual|weekly-only|five-only|no-quota 注入 fixture
      // 用于无 Codex CLI 时验证 Card 视觉。生产不传此变量。
      if (process.env.CARD_PREVIEW) {
        url.searchParams.set("preview", process.env.CARD_PREVIEW);
      }
      await window.loadURL(url.toString());
    } else {
      const query: Record<string, string> = { surface: kind };
      if (process.env.CARD_PREVIEW) query.preview = process.env.CARD_PREVIEW;
      await window.loadFile(fileURLToPath(new URL("../renderer/index.html", import.meta.url)), {
        query,
      });
    }

    return window;
  }
}
