import { app, ipcMain, nativeTheme } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { CompanionBridgeClient } from "./bridge.js";
import { registerDesktopIpc } from "./ipc.js";
import { desktopChannels } from "./channels.js";
import { SurfaceWindowManager } from "./windows/manager.js";
import { AutoSurfaceWatcher } from "./windows/auto-surface-watcher.js";
import { NullForegroundWindowAdapter, type ForegroundWindowAdapter } from "./windows/foreground.js";
import { PowerShellForegroundWindowAdapter } from "./windows/foreground-powershell.js";
import { HoverProbe } from "./windows/hover-probe.js";
import { OrbHoverController } from "./windows/orb-hover-controller.js";
import { ProbeDaemon } from "./windows/probe-daemon.js";
import type { SurfaceKind } from "../shared/desktop.js";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
const windowManager = new SurfaceWindowManager();
const bridgeClient = new CompanionBridgeClient({
  bridgeScript: join(app.getAppPath(), "dist", "companionBridge.js"),
});
let unregisterIpc: (() => void) | undefined;
let autoSurfaceWatcher: AutoSurfaceWatcher | undefined;
let orbHoverController: OrbHoverController | undefined;
/** P2-1：manager surface 变更监听器取消函数（hover controller 订阅）。 */
let offSurfaceChange: (() => void) | undefined;
/** D-3 性能修复：共享长驻 PS 守护进程，foreground + hover 复用，避免每探针 spawn。 */
let probeDaemon: ProbeDaemon | undefined;
let shuttingDown = false;

/**
 * D-3 性能修复：创建/复用共享长驻 ProbeDaemon（win32 + probe-daemon.ps1 存在）。
 * foreground 和 hover 两个 adapter 共用同一守护进程，spawn + Add-Type 只发生一次。
 * 返回 null 表示平台不支持或脚本缺失（调用方降级为 Null adapter）。
 */
function getProbeDaemon(): ProbeDaemon | null {
  if (process.platform !== "win32") return null;
  if (probeDaemon) return probeDaemon;
  const scriptPath = join(app.getAppPath(), "electron", "probe-daemon.ps1");
  if (!existsSync(scriptPath)) {
    console.error(`[probe-daemon] script not found: ${scriptPath}; probes disabled`);
    return null;
  }
  probeDaemon = new ProbeDaemon({ scriptPath });
  return probeDaemon;
}

/**
 * D-3 切片 1：前台窗口检测 → 自动 surface 切换。
 * 仅生产路径启用：dev（SURFACE env）和 capture（CAPTURE_PREVIEW）都固定 surface，不应被 watcher 打断。
 * 非 win32 / 守护进程缺失：用 NullForegroundWindowAdapter（探针永远 error → watcher 保持当前 surface）。
 */
function createForegroundAdapter(): ForegroundWindowAdapter {
  const daemon = getProbeDaemon();
  if (!daemon) return new NullForegroundWindowAdapter();
  return new PowerShellForegroundWindowAdapter({ daemon });
}

/**
 * D-3 切片 2：hover 展开 Orb → EdgeCapsule。
 * 仅 win32 + 生产路径 + 守护进程可用。controller 自判可见 surface：card/bar 时静默。
 * P2-1：订阅 manager surface 变更，click/showSurface 切换后同步 controller 状态。
 */
function createOrbHoverController(): OrbHoverController | undefined {
  const daemon = getProbeDaemon();
  if (!daemon) return undefined;
  const hoverProbe = new HoverProbe({ daemon });
  const controller = new OrbHoverController(windowManager, hoverProbe);
  // P2-1：manager 通知 surface 变更 → controller.onSurfaceChanged 同步状态。
  // renderer click → showSurface → manager.showOnly → onSurfaceChange → controller。
  offSurfaceChange = windowManager.onSurfaceChange((kind) => controller.onSurfaceChanged(kind));
  return controller;
}

function shouldRunAutoSurface(): boolean {
  // dev / capture 固定 surface，watcher 不启动。
  if (process.env.SURFACE) return false;
  if (process.env.CAPTURE_PREVIEW === "1") return false;
  return true;
}

/**
 * P1-1：注册 hover suspend/resume IPC（拖动期间暂停 hover）。
 * sender 必须是 orb（拖动 IPC 只能来自 Orb renderer）。无 controller 时静默忽略。
 */
function registerHoverSuspendIpc(): void {
  ipcMain.on(desktopChannels.suspendHover, (event) => {
    const senderSurface = windowManager.getSurfaceForWebContents(event.sender.id);
    if (senderSurface !== "orb") return;
    orbHoverController?.suspend();
  });
  ipcMain.on(desktopChannels.resumeHover, (event) => {
    const senderSurface = windowManager.getSurfaceForWebContents(event.sender.id);
    if (senderSurface !== "orb") return;
    orbHoverController?.resume();
  });
}

/**
 * 截图模式：CAPTURE_PREVIEW=1 时，启动后等待 renderer 渲染稳定，截 Card 窗口 PNG，
 * 写到 docs/ui-designs/_actual/<CARD_PREVIEW>.png 后退出。
 * CARD_PREVIEW 由 renderer fixtures 决定显示哪个状态（dual/weekly-only/.../zcode-no-data）。
 * 生产环境不传 CAPTURE_PREVIEW，根本不进这分支。
 */
const CAPTURE_DELAY_MS = 1500;

// v26：capture 模式按 CAPTURE_THEME 设置主题（默认 light，支持 dark 做主题矩阵截图）
if (process.env.CAPTURE_PREVIEW === "1") {
  nativeTheme.themeSource = process.env.CAPTURE_THEME === "dark" ? "dark" : "light";
}

async function captureAndQuit(): Promise<void> {
  const preview = process.env.CARD_PREVIEW;
  if (!preview) {
    console.error("[capture] CAPTURE_PREVIEW=1 但未设 CARD_PREVIEW");
    app.quit();
    return;
  }
  // 截当前显示的 surface（由 SURFACE env 决定，默认 card）。
  const surfaceKind = (process.env.SURFACE ?? "card") as SurfaceKind;
  const targetWindow = windowManager.getBrowserWindow(surfaceKind);
  if (!targetWindow || targetWindow.isDestroyed()) {
    console.error(`[capture] ${surfaceKind} 窗口不存在`);
    app.quit();
    return;
  }
  // v26：DPI 缩放（CAPTURE_SCALE）。用 device emulation 设置 devicePixelRatio，
  // 验证响应式布局/媒体查询在高 DPI 下不裁切。注意：capturePage 输出仍为逻辑像素尺寸，
  // 但渲染器观察到的 device-pixel-ratio 已变化，能暴露 min-resolution 相关的布局问题。
  const scaleStr = process.env.CAPTURE_SCALE;
  const scale = scaleStr ? Number.parseFloat(scaleStr) : 1;
  if (Number.isFinite(scale) && scale !== 1) {
    const [w = 0, h = 0] = targetWindow.getContentSize();
    const wc = targetWindow.webContents;
    wc.enableDeviceEmulation({
      deviceScaleFactor: scale,
      screenPosition: "desktop",
      // desktop 模式下以下字段不起作用，但类型要求提供
      screenSize: { width: w, height: h },
      viewPosition: { x: 0, y: 0 },
      viewSize: { width: w, height: h },
      scale: 1,
    });
    // 等一帧让 emulation 生效后再截图
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const image = await targetWindow.capturePage();
  // 输出文件名：CAPTURE_OUTPUT_NAME 优先；否则用 preview（card 向后兼容）。
  const outputName = process.env.CAPTURE_OUTPUT_NAME ?? preview;
  const outPath = join(process.cwd(), "docs/ui-designs/_actual", `${outputName}.png`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, image.toPNG());
  console.log(`[capture] wrote ${outPath} (${image.getSize().width}x${image.getSize().height})`);
  app.quit();
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  orbHoverController?.stop();
  orbHoverController = undefined;
  offSurfaceChange?.();
  offSurfaceChange = undefined;
  autoSurfaceWatcher?.stop();
  autoSurfaceWatcher = undefined;
  unregisterIpc?.();
  unregisterIpc = undefined;
  windowManager.closeAll();
  // D-3 性能修复：优雅退出共享守护进程（发 quit + 等退出，超时强杀）。
  const daemon = probeDaemon;
  probeDaemon = undefined;
  if (daemon) {
    try {
      await daemon.dispose();
    } catch {
      // dispose 内部已兜底，忽略。
    }
  }
  await bridgeClient.close();
  app.quit();
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    void windowManager.showOnly("card");
  });

  app
    .whenReady()
    .then(async () => {
      try {
        await bridgeClient.start();
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Companion bridge startup failed");
      }
      unregisterIpc = registerDesktopIpc(windowManager, bridgeClient);
      // P1-1：hover suspend/resume IPC（拖动期间暂停 hover）。sender 必须是 orb。
      registerHoverSuspendIpc();
      // SURFACE env：dev/capture 用，默认 card。生产由自动模式 + 托盘菜单驱动（后续 milestone）。
      const initialSurface = (process.env.SURFACE ?? "card") as SurfaceKind;
      await windowManager.showOnly(initialSurface);

      // D-3 切片 1：生产路径启动前台检测 → 自动 surface 切换。dev/capture 跳过。
      if (shouldRunAutoSurface()) {
        autoSurfaceWatcher = new AutoSurfaceWatcher(createForegroundAdapter(), windowManager, {
          initialSurface,
        });
        autoSurfaceWatcher.start();

        // D-3 切片 2：hover 展开 Orb → EdgeCapsule。与 watcher 同条件（生产路径），
        // 且仅 win32 + probe 脚本存在时启动。controller 自判可见 surface，card/bar 时静默。
        orbHoverController = createOrbHoverController();
        orbHoverController?.start();
      }

      // 截图模式：渲染稳定后截 Card，写文件后退出。生产路径（无 CAPTURE_PREVIEW）跳过。
      if (process.env.CAPTURE_PREVIEW === "1") {
        setTimeout(() => {
          void captureAndQuit();
        }, CAPTURE_DELAY_MS);
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Electron startup failed");
      app.quit();
    });

  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    void shutdown();
  });

  app.on("window-all-closed", () => {
    void shutdown();
  });
}
