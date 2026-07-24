import { app, ipcMain, nativeTheme } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { CompanionBridgeClient } from "./bridge.js";
import { registerDesktopIpc, broadcastPreferences, broadcastUsage } from "./ipc.js";
import { desktopChannels } from "./channels.js";
import { SurfaceWindowManager } from "./windows/manager.js";
import { AutoSurfaceWatcher } from "./windows/auto-surface-watcher.js";
import { NullForegroundWindowAdapter, type ForegroundWindowAdapter } from "./windows/foreground.js";
import { PowerShellForegroundWindowAdapter } from "./windows/foreground-powershell.js";
import { HoverProbe } from "./windows/hover-probe.js";
import { OrbHoverController } from "./windows/orb-hover-controller.js";
import { ProbeDaemon } from "./windows/probe-daemon.js";
import { SettingsRepository } from "./settings/repository.js";
import { createPreferenceCommitter, performTrayRefresh } from "./preferences.js";
import { createTray } from "./tray/index.js";
import type { TrayMenuCallbacks } from "./tray/menu-builder.js";
import type { SurfaceKind } from "../shared/desktop.js";
import type {
  ClientKind,
  DisplayPreference,
  Language,
  PreferenceKey,
  Settings,
  ThemePreference,
} from "../shared/settings.js";
import { DEFAULT_SETTINGS, resolveLanguageFromLocale } from "../shared/settings.js";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
const windowManager = new SurfaceWindowManager();
const bridgeClient = new CompanionBridgeClient({
  bridgeScript: join(app.getAppPath(), "dist", "companionBridge.js"),
});
// Milestone E-F/G：用户偏好仓库（主进程单一真相源）。
// 注意：不在模块初始化阶段创建（也不调 app.getLocale/getPreferredSystemLanguages）——
// Electron 这些 API 在 app.whenReady() 前不可靠。settingsRepo 在 whenReady 内创建并 load。
let settingsRepo: SettingsRepository | undefined;
let unregisterIpc: (() => void) | undefined;
let autoSurfaceWatcher: AutoSurfaceWatcher | undefined;
let orbHoverController: OrbHoverController | undefined;
/** P2-1：manager surface 变更监听器取消函数（hover controller 订阅）。 */
let offSurfaceChange: (() => void) | undefined;
/** D-3 性能修复：共享长驻 PS 守护进程，foreground + hover 复用，避免每探针 spawn。 */
let probeDaemon: ProbeDaemon | undefined;
/** Milestone E-F：托盘实例（destroy 用）。 */
let trayHandle: { destroy(): void; rebuild(): void } | undefined;
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
 * Milestone E-F 验收修复（问题 1）：在 app.whenReady() 后取系统首选语言。
 * 优先 app.getPreferredSystemLanguages()[0]（BCP-47），回退 app.getLocale()，再回退 ""。
 * 纯读，不依赖 whenReady 外的状态。
 */
function readSystemLanguage(): string {
  const preferred = app.getPreferredSystemLanguages();
  if (Array.isArray(preferred) && preferred.length > 0 && typeof preferred[0] === "string") {
    return preferred[0]!;
  }
  return app.getLocale();
}

/**
 * Milestone E-F/G：应用主题偏好的副作用。
 * auto → nativeTheme.themeSource="system"（跟随系统）；light/dark → 强制。
 * Electron nativeTheme 是系统级主题源，renderer 通过 onSystemThemeChange 收到解析后的主题。
 */
function applyThemePreference(pref: ThemePreference): void {
  nativeTheme.themeSource = pref === "auto" ? "system" : pref;
}

/**
 * Milestone E-F：应用展示模式偏好的副作用。
 * auto → 启动前台检测 watcher（仅生产路径）；非 auto → 停 watcher + 固定显示该 surface。
 * 返回当前应显示的初始 surface（auto 时由 watcher 决定，此处返当前可见 surface）。
 */
async function applyDisplayPreference(
  pref: DisplayPreference,
  initialSurface: SurfaceKind,
): Promise<SurfaceKind> {
  if (!shouldRunAutoSurface()) return initialSurface;
  if (pref === "auto") {
    // 启动 watcher（若未运行）。watcher 接管 surface 切换。
    startAutoSurface(initialSurface);
    return initialSurface;
  }
  // 非 auto：停 watcher，固定显示偏好指定的 surface。
  stopAutoSurface();
  const target = pref; // displayPreference 的非 auto 值就是 SurfaceKind（card/indicator-bar/orb）
  await windowManager.showOnly(target).catch((err: unknown) => {
    console.error("[main] showOnly for displayPreference failed:", err);
  });
  return target;
}

/** 启动前台检测 watcher + hover controller（幂等：已运行则跳过）。 */
function startAutoSurface(initialSurface: SurfaceKind): void {
  if (autoSurfaceWatcher) return;
  autoSurfaceWatcher = new AutoSurfaceWatcher(createForegroundAdapter(), windowManager, {
    initialSurface,
  });
  autoSurfaceWatcher.start();
  orbHoverController = createOrbHoverController();
  orbHoverController?.start();
}

/** 停止前台检测 watcher + hover controller（幂等）。 */
function stopAutoSurface(): void {
  orbHoverController?.stop();
  orbHoverController = undefined;
  offSurfaceChange?.();
  offSurfaceChange = undefined;
  autoSurfaceWatcher?.stop();
  autoSurfaceWatcher = undefined;
}

/**
 * Milestone E-F/G：偏好提交协调器（生产实例）。
 * 副作用经 PreferenceSideEffects 接口注入——协调逻辑在 electron/preferences.ts 可测模块里，
 * 测试调真实 createPreferenceCommitter，不再复制逻辑（验收 P2 修复）。
 * 在 whenReady 后（repo/tray/windowManager 就绪）创建。
 */
let commitPreference: (<K extends PreferenceKey>(key: K, value: string) => Settings) | undefined;

/** 取当前可见 surface（无则 card），用于 displayPreference 切到 auto 时的 watcher 初值。 */
function getVisibleSurfaceSafe(): SurfaceKind {
  return windowManager.getVisibleSurface() ?? "card";
}

/**
 * Milestone E-F：托盘菜单回调。每个回调经 commitPreference 写偏好 + 应用副作用。
 * openCard / refresh / quit 不改偏好，直接调对应能力。
 */
function makeTrayCallbacks(): TrayMenuCallbacks {
  return {
    openCard: () => {
      void windowManager.showOnly("card").catch((err: unknown) => {
        console.error("[tray] openCard failed:", err);
      });
    },
    setDisplayPreference: (pref) => {
      commitPreference?.("displayPreference", pref);
    },
    setActiveClient: (client: ClientKind) => {
      commitPreference?.("activeClient", client);
    },
    setThemePreference: (pref: ThemePreference) => {
      commitPreference?.("themePreference", pref);
    },
    setLanguage: (lang: Language) => {
      commitPreference?.("language", lang);
    },
    refresh: () => {
      // 验收轮 4 P2：调真实 performTrayRefresh 协调函数（refresh→broadcast+错误处理），
      // 不在回调里手写串联——测试和 main.ts 调同一份逻辑，漏广播会被测出。
      void performTrayRefresh(
        () => bridgeClient.refreshUsage(),
        (snapshot) => broadcastUsage(snapshot),
      );
    },
    quit: () => {
      app.quit();
    },
  };
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
  // Milestone E-F：销毁托盘。
  trayHandle?.destroy();
  trayHandle = undefined;
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
  // Milestone E-F/G：确保偏好写盘完成后再退出。
  const repo = settingsRepo;
  settingsRepo = undefined;
  if (repo) {
    try {
      await repo.flush();
    } catch {
      // flush 内部已兜底。
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
      // 问题 1：settingsRepo 在 whenReady 后创建（不在模块初始化阶段调 app.getLocale 等）。
      // 首次文件缺失时 language 按系统首选语言解析；用户已保存走文件读取分支，不受影响。
      settingsRepo = new SettingsRepository({
        dir: app.getPath("userData"),
        initialDefaults: {
          ...DEFAULT_SETTINGS,
          language: resolveLanguageFromLocale(readSystemLanguage()),
        },
      });
      const repo = settingsRepo;
      // Milestone E-F/G：加载用户偏好（主进程单一真相源）。文件缺失/损坏回退默认。
      const settings = repo.load();
      // 应用初始主题偏好（让 nativeTheme 在首个窗口创建前就位）。
      if (process.env.CAPTURE_PREVIEW !== "1") {
        applyThemePreference(settings.themePreference);
      }
      try {
        await bridgeClient.start();
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Companion bridge startup failed");
      }
      // 创建偏好提交协调器（electron/preferences.ts 可测模块），注入真实副作用。
      // IPC 和托盘回调都经此单一入口（broadcast + tray.rebuild + theme/display/client 副作用全执行）。
      commitPreference = createPreferenceCommitter(repo, {
        broadcast: broadcastPreferences,
        rebuildTray: () => trayHandle?.rebuild(),
        applyTheme: applyThemePreference,
        applyDisplay: (pref) => {
          void applyDisplayPreference(pref, getVisibleSurfaceSafe());
        },
        resizeClient: (client) => windowManager.resizeCardWindow(client),
      });
      // registerDesktopIpc 经 callbacks 走 commitPreference/getPreferences 统一入口（问题 2）。
      unregisterIpc = registerDesktopIpc(windowManager, bridgeClient, {
        getPreferences: () => repo.get(),
        onSetPreference: (key, value) => commitPreference?.(key, value),
      });
      // P1-1：hover suspend/resume IPC（拖动期间暂停 hover）。sender 必须是 orb。
      registerHoverSuspendIpc();
      // Milestone E-F：创建托盘（生产路径，dev/capture 也建便于调试）。
      if (process.env.CAPTURE_PREVIEW !== "1") {
        trayHandle = createTray({ repo, callbacks: makeTrayCallbacks() });
      }
      // SURFACE env：dev/capture 用，默认 card。生产由 displayPreference 决定。
      const initialSurface = (process.env.SURFACE ?? "card") as SurfaceKind;
      await windowManager.showOnly(initialSurface);

      // D-3 切片 1 + Milestone E-F：前台检测/自动模式。
      // 生产路径：displayPreference==="auto" 启动 watcher；非 auto 固定显示该 surface。
      // dev/capture（SURFACE/CAPTURE env）固定 initialSurface，watcher 不启动。
      if (shouldRunAutoSurface()) {
        await applyDisplayPreference(settings.displayPreference, initialSurface);
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
