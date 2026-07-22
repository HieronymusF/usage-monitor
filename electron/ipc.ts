import { BrowserWindow, ipcMain, nativeTheme } from "electron";
import type { CardClientKind, DesktopContext, SystemTheme } from "../shared/desktop.js";
import { validateSurfaceKind } from "../shared/desktop.js";
import type { CompanionBridgeClient } from "./bridge.js";
import { desktopChannels } from "./channels.js";
import type { SurfaceWindowManager } from "./windows/manager.js";

function currentSystemTheme(): SystemTheme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function registerDesktopIpc(
  windowManager: SurfaceWindowManager,
  bridgeClient: CompanionBridgeClient,
): () => void {
  ipcMain.handle(desktopChannels.getContext, (event): DesktopContext => {
    const surface = windowManager.getSurfaceForWebContents(event.sender.id);
    if (!surface) throw new Error("Unknown renderer");

    return {
      platform: process.platform,
      surface,
      // v26：capture 模式按 CAPTURE_THEME 设置（默认 light，支持 dark 做主题矩阵截图）
      systemTheme:
        process.env.CAPTURE_PREVIEW === "1"
          ? process.env.CAPTURE_THEME === "dark"
            ? "dark"
            : "light"
          : currentSystemTheme(),
    };
  });
  ipcMain.handle(desktopChannels.getUsage, () => bridgeClient.getUsage());
  ipcMain.handle(desktopChannels.refreshUsage, () => bridgeClient.refreshUsage());

  // Card 窗口尺寸切换（单向命令，无返回值）。
  ipcMain.on(desktopChannels.resizeCardWindow, (_event, kind: CardClientKind) => {
    if (kind === "codex" || kind === "zcode") {
      windowManager.resizeCardWindow(kind);
    }
  });

  // Surface 切换（单向命令，无返回值）。如 edge-capsule 收起 → orb。
  // 运行时校验：只接受 surfaceKinds 中的值，非法 payload（伪造/类型错误）忽略 + 记录。
  ipcMain.on(desktopChannels.showSurface, (_event, kind: unknown) => {
    const validKind = validateSurfaceKind(kind);
    if (validKind === null) {
      console.error(`[ipc] showSurface rejected invalid kind: ${JSON.stringify(kind)}`);
      return;
    }
    // 捕获 showOnly rejection（窗口创建/加载失败），避免 unhandled rejection 崩进程。
    void windowManager.showOnly(validKind).catch((err: unknown) => {
      console.error("[ipc] showOnly failed:", err);
    });
  });

  const notifyThemeChanged = (): void => {
    const theme = currentSystemTheme();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(desktopChannels.systemThemeChanged, theme);
    }
  };

  nativeTheme.on("updated", notifyThemeChanged);

  return () => {
    nativeTheme.off("updated", notifyThemeChanged);
    ipcMain.removeHandler(desktopChannels.getContext);
    ipcMain.removeHandler(desktopChannels.getUsage);
    ipcMain.removeHandler(desktopChannels.refreshUsage);
    ipcMain.removeAllListeners(desktopChannels.resizeCardWindow);
    ipcMain.removeAllListeners(desktopChannels.showSurface);
  };
}
