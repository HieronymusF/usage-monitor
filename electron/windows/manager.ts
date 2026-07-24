import { BrowserWindow, screen, type Display } from "electron";
import { fileURLToPath } from "node:url";
import type { SurfaceKind } from "../../shared/desktop.js";
import {
  ORB_EDGE_PEEK_DIP,
  canPeekOrbAtEdge,
  inferOrbDropEdge,
  inferOrbSnapEdge,
  nearestHorizontalEdge,
  placeOrbAtEdge,
} from "../../shared/orb-drag.js";
import {
  WINDOW_EDGE_MARGIN_DIP,
  anchorWindowToSource,
  captureWindowPlacement,
  inferWindowSnapEdge,
  resolveWindowPlacement,
  type PlacementDisplay,
  type WindowPlacement,
  type WindowSnapEdge,
} from "../../shared/window-placement.js";
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

export interface SurfaceWindowManagerOptions {
  /** 从主进程 SettingsRepository 读取位置；未就绪/未保存返回 null。 */
  readPlacement?(kind: SurfaceKind): WindowPlacement | null;
  /** 写回主进程 SettingsRepository。renderer 不参与。 */
  writePlacement?(kind: SurfaceKind, placement: WindowPlacement): void;
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
  readonly #readPlacement: (kind: SurfaceKind) => WindowPlacement | null;
  readonly #writePlacement: (kind: SurfaceKind, placement: WindowPlacement) => void;

  constructor(options: SurfaceWindowManagerOptions = {}) {
    this.#readPlacement = options.readPlacement ?? (() => null);
    this.#writePlacement = options.writePlacement ?? (() => {});
  }

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

  /** 主显示器排第一；原显示器断开时恢复逻辑会安全回退到它。 */
  #getOrderedDisplays(): Display[] {
    const primary = screen.getPrimaryDisplay();
    return [primary, ...screen.getAllDisplays().filter((item) => item.id !== primary.id)];
  }

  #getPlacementDisplays(): PlacementDisplay[] {
    return this.#getOrderedDisplays().map((display) => ({
      id: String(display.id),
      workArea: {
        x: display.workArea.x,
        y: display.workArea.y,
        width: display.workArea.width,
        height: display.workArea.height,
      },
    }));
  }

  /**
   * 360 类靠边隐藏只用于真实桌面外沿。若该边有侧边任务栏或连接另一显示器，
   * 保持完整可见，避免 Orb 落到任务栏或相邻屏幕。
   */
  #getOrbVisibleWidthAtEdge(
    display: Display,
    edge: WindowSnapEdge,
    y: number,
    height: number,
    width: number,
  ): number {
    const hiddenDepth = width - ORB_EDGE_PEEK_DIP;
    const otherDisplayBounds = screen
      .getAllDisplays()
      .filter((candidate) => candidate.id !== display.id)
      .map((candidate) => candidate.bounds);
    return canPeekOrbAtEdge(
      display.bounds,
      display.workArea,
      otherDisplayBounds,
      edge,
      y,
      height,
      hiddenDepth,
    )
      ? ORB_EDGE_PEEK_DIP
      : width;
  }

  /** 捕获当前绝对 bounds 为相对 workArea 的 placement，并交给 repository。 */
  #persistWindowPlacement(
    kind: SurfaceKind,
    window: BrowserWindow,
    snapEdgeOverride?: WindowSnapEdge | null,
  ): void {
    if (window.isDestroyed()) return;
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const placementDisplay: PlacementDisplay = {
      id: String(display.id),
      workArea: {
        x: display.workArea.x,
        y: display.workArea.y,
        width: display.workArea.width,
        height: display.workArea.height,
      },
    };
    const snapEdge =
      snapEdgeOverride !== undefined
        ? snapEdgeOverride
        : kind === "orb"
          ? inferOrbSnapEdge(bounds, placementDisplay.workArea)
          : inferWindowSnapEdge(bounds, placementDisplay.workArea);
    const placement = captureWindowPlacement(bounds, placementDisplay, snapEdge);
    try {
      this.#writePlacement(kind, placement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[manager] persist ${kind} placement failed: ${message}`);
    }
  }

  /** 用已保存 placement 恢复并 clamp；没有保存/没有显示器时返回 false。 */
  #restoreWindowPlacement(kind: SurfaceKind, window: BrowserWindow): boolean {
    const placement = this.#readPlacement(kind);
    if (!placement) return false;
    const bounds = window.getBounds();
    const displays = this.#getPlacementDisplays();
    const resolved = resolveWindowPlacement(
      placement,
      { width: bounds.width, height: bounds.height },
      displays,
    );
    if (!resolved) return false;
    let position = { x: resolved.x, y: resolved.y };
    if (kind === "orb" && placement.snapEdge !== null) {
      const display = this.#getOrderedDisplays().find(
        (candidate) => String(candidate.id) === resolved.displayId,
      );
      if (display) {
        const visibleWidth = this.#getOrbVisibleWidthAtEdge(
          display,
          placement.snapEdge,
          resolved.y,
          bounds.height,
          bounds.width,
        );
        position = placeOrbAtEdge(
          { ...bounds, x: resolved.x, y: resolved.y },
          display.workArea,
          placement.snapEdge,
          WINDOW_EDGE_MARGIN_DIP,
          visibleWidth,
        );
      }
    }
    window.setPosition(position.x, position.y);
    // 原显示器断开时写回实际 fallback display，避免每次启动重复找失效 displayId。
    this.#persistWindowPlacement(kind, window, placement.snapEdge);
    return true;
  }

  /** 沿用当前可见窗口的右下锚点，供首次形态切换及 Orb↔Capsule 同边展开/收起。 */
  #anchorToVisibleSource(kind: SurfaceKind, target: BrowserWindow, source: BrowserWindow): void {
    const sourceBounds = source.getBounds();
    const display = screen.getDisplayMatching(sourceBounds);
    const targetBounds = target.getBounds();
    const sourceSnapEdge =
      source === this.#windows.get("orb")
        ? inferOrbSnapEdge(sourceBounds, display.workArea)
        : inferWindowSnapEdge(sourceBounds, display.workArea);
    let position = anchorWindowToSource(
      sourceBounds,
      { width: targetBounds.width, height: targetBounds.height },
      display.workArea,
      sourceSnapEdge,
    );
    if (kind === "orb" && sourceSnapEdge !== null) {
      const visibleWidth = this.#getOrbVisibleWidthAtEdge(
        display,
        sourceSnapEdge,
        position.y,
        targetBounds.height,
        targetBounds.width,
      );
      position = placeOrbAtEdge(
        { ...targetBounds, x: position.x, y: position.y },
        display.workArea,
        sourceSnapEdge,
        WINDOW_EDGE_MARGIN_DIP,
        visibleWidth,
      );
    }
    target.setPosition(position.x, position.y);
    this.#persistWindowPlacement(kind, target);
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

  /** 当前 Orb 是否处于左右贴边语义；自由位置返回 false。 */
  isOrbWindowAtEdge(): boolean {
    const window = this.#windows.get("orb");
    if (!window || window.isDestroyed()) return false;
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    return inferOrbSnapEdge(bounds, display.workArea) !== null;
  }

  /** hover 半隐藏 Orb 时，把它移到同边完整可见的贴边位置；不写盘（这是临时交互态）。 */
  revealOrbWindow(): void {
    const window = this.#windows.get("orb");
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const edge =
      inferOrbSnapEdge(bounds, display.workArea) ?? nearestHorizontalEdge(bounds, display.workArea);
    const target = placeOrbAtEdge(
      bounds,
      display.workArea,
      edge,
      WINDOW_EDGE_MARGIN_DIP,
      bounds.width,
    );
    if (bounds.x !== target.x || bounds.y !== target.y) window.setPosition(target.x, target.y);
  }

  /** 完整贴边 Orb 被窗口外点击后，退回同边半隐藏静止态并保存贴边语义。 */
  concealOrbWindow(): void {
    const window = this.#windows.get("orb");
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const edge =
      inferOrbSnapEdge(bounds, display.workArea) ?? nearestHorizontalEdge(bounds, display.workArea);
    const fullyVisibleTarget = placeOrbAtEdge(
      bounds,
      display.workArea,
      edge,
      WINDOW_EDGE_MARGIN_DIP,
      bounds.width,
    );
    const visibleWidth = this.#getOrbVisibleWidthAtEdge(
      display,
      edge,
      fullyVisibleTarget.y,
      bounds.height,
      bounds.width,
    );
    const target = placeOrbAtEdge(
      bounds,
      display.workArea,
      edge,
      WINDOW_EDGE_MARGIN_DIP,
      visibleWidth,
    );
    if (bounds.x !== target.x || bounds.y !== target.y) window.setPosition(target.x, target.y);
    this.#persistWindowPlacement("orb", window, edge);
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

  /** 拖动结束：碰到左右边缘则吸附为完整 revealed Orb；否则原位自由悬浮。 */
  finishOrbWindowDrag(): void {
    const window = this.#windows.get("orb");
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const dropEdge = inferOrbDropEdge(bounds, display.workArea);
    if (dropEdge !== null) {
      const target = placeOrbAtEdge(
        bounds,
        display.workArea,
        dropEdge,
        WINDOW_EDGE_MARGIN_DIP,
        bounds.width,
      );
      if (bounds.x !== target.x || bounds.y !== target.y) {
        window.setPosition(target.x, target.y);
      }
      this.#persistWindowPlacement("orb", window, dropEdge);
      return;
    }
    const placement = captureWindowPlacement(
      bounds,
      { id: String(display.id), workArea: display.workArea },
      null,
    );
    const resolved = resolveWindowPlacement(
      placement,
      { width: bounds.width, height: bounds.height },
      [{ id: String(display.id), workArea: display.workArea }],
    );
    if (resolved && (bounds.x !== resolved.x || bounds.y !== resolved.y)) {
      window.setPosition(resolved.x, resolved.y);
    }
    this.#persistWindowPlacement("orb", window, null);
  }

  /** Orb/EdgeCapsule 共用：选最近左右边；Orb 在真实外沿部分隐藏，Capsule 完整可见。 */
  #snapWindowToEdge(kind: "orb" | "edge-capsule", window: BrowserWindow): void {
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const workArea = display.workArea;
    const edge = nearestHorizontalEdge(bounds, workArea);
    const fullyVisibleTarget = placeOrbAtEdge(
      bounds,
      workArea,
      edge,
      WINDOW_EDGE_MARGIN_DIP,
      bounds.width,
    );
    const visibleWidth =
      kind === "orb"
        ? this.#getOrbVisibleWidthAtEdge(
            display,
            edge,
            fullyVisibleTarget.y,
            bounds.height,
            bounds.width,
          )
        : bounds.width;
    const target = placeOrbAtEdge(bounds, workArea, edge, WINDOW_EDGE_MARGIN_DIP, visibleWidth);
    if (bounds.x !== target.x || bounds.y !== target.y) {
      window.setPosition(target.x, target.y);
    }
    this.#persistWindowPlacement(kind, window, edge);
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
    // 高度从 ZCode 333 切回 Codex 404 时可能越过工作区底部；按当前 display 重新 clamp。
    const bounds = card.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const currentPlacement = captureWindowPlacement(
      bounds,
      {
        id: String(display.id),
        workArea: display.workArea,
      },
      inferWindowSnapEdge(bounds, display.workArea),
    );
    const resolved = resolveWindowPlacement(
      currentPlacement,
      { width: bounds.width, height: bounds.height },
      [{ id: String(display.id), workArea: display.workArea }],
    );
    if (resolved) card.setPosition(resolved.x, resolved.y);
    this.#persistWindowPlacement("card", card, currentPlacement.snapEdge);
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
    const visibleOld = [...this.#windows.entries()].find(
      ([, window]) =>
        !window.isDestroyed() && window.isVisible() && window !== this.#windows.get(kind),
    );
    const target = await this.#getOrCreate(kind);
    // P1-4：await 期间若有更新的 showOnly 发出，放弃本次显隐（让后发为准）。
    // P1（本轮）：返回 applied=false（非异常），让调用方区分"被抢占"和"实际应用"。
    if (myGeneration !== this.#showOnlyGeneration) {
      return { window: target, applied: false };
    }
    if (visibleOld) {
      this.#persistWindowPlacement(visibleOld[0], visibleOld[1]);
    }
    const isOrbToCapsule = visibleOld?.[0] === "orb" && kind === "edge-capsule";
    const isCapsuleToOrb = visibleOld?.[0] === "edge-capsule" && kind === "orb";
    if (visibleOld && isOrbToCapsule) {
      // 展开时从当前 Orb 锚定 Capsule；Orb 自己的位置已在上方保存，供收起恢复。
      this.#anchorToVisibleSource(kind, target, visibleOld[1]);
    } else if (visibleOld && isCapsuleToOrb) {
      // 收起必须回到展开前的 Orb 位置：边缘 placement 恢复半隐藏，自由 placement 原位恢复。
      if (!this.#restoreWindowPlacement(kind, target)) {
        this.#anchorToVisibleSource(kind, target, visibleOld[1]);
      }
    } else if (!this.#restoreWindowPlacement(kind, target) && visibleOld) {
      // 目标从未保存过：沿用当前显示器/锚点作为第一次位置，并立即保存。
      this.#anchorToVisibleSource(kind, target, visibleOld[1]);
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
    for (const [kind, window] of this.#windows) {
      this.#persistWindowPlacement(kind, window);
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
    if (kind !== "orb") {
      // Card/Bar/Capsule 使用原生 drag region；Windows 的 moved 在一次拖动结束后触发一次。
      // Orb 由 JS 高频 setPosition，不能监听 moved 写盘，改在 finishOrbWindowDrag 后单次保存。
      window.on("moved", () => {
        if (kind === "edge-capsule") {
          // Capsule 是 Orb 的展开态，拖动结束同样贴边，保证收起时不漂到屏幕中间。
          this.#snapWindowToEdge(kind, window);
        } else {
          this.#persistWindowPlacement(kind, window);
        }
      });
    }

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
