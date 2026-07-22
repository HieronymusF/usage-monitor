import { BrowserWindow, screen } from "electron";
import { fileURLToPath } from "node:url";
import type { SurfaceKind } from "../../shared/desktop.js";
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

export class SurfaceWindowManager {
  readonly #windows = new Map<SurfaceKind, BrowserWindow>();
  readonly #surfaceByWebContentsId = new Map<number, SurfaceKind>();

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

  async showOnly(kind: SurfaceKind): Promise<BrowserWindow> {
    // v29：收起/展开时保持屏幕边缘位置（修复 Orb 跳主显示器）。
    // 读当前可见窗口的 bounds + 解析其所在显示器，目标窗口 setPosition 到同一显示器的右下锚点。
    // 复用 WPF Set-OrbExpanded 算法：anchor 右下角，clamp 到当前显示器 workArea，留 6px 边距。
    const visibleOld = [...this.#windows.values()].find(
      (w) => !w.isDestroyed() && w.isVisible() && w !== this.#windows.get(kind),
    );
    const target = await this.#getOrCreate(kind);
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
    return target;
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
