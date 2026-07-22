import { app, nativeTheme } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CompanionBridgeClient } from "./bridge.js";
import { registerDesktopIpc } from "./ipc.js";
import { SurfaceWindowManager } from "./windows/manager.js";
import type { SurfaceKind } from "../shared/desktop.js";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
const windowManager = new SurfaceWindowManager();
const bridgeClient = new CompanionBridgeClient({
  bridgeScript: join(app.getAppPath(), "dist", "companionBridge.js"),
});
let unregisterIpc: (() => void) | undefined;
let shuttingDown = false;

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
  unregisterIpc?.();
  unregisterIpc = undefined;
  windowManager.closeAll();
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
      // SURFACE env：dev/capture 用，默认 card。生产由自动模式 + 托盘菜单驱动（后续 milestone）。
      const initialSurface = (process.env.SURFACE ?? "card") as SurfaceKind;
      await windowManager.showOnly(initialSurface);

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
