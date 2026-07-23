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

  // D-3 切片 3（P1-3 修复）：Orb 拖动 —— 单向命令。
  // 校验 IPC sender 对应的 surface 必须是 orb（拖动 IPC 只能来自 Orb renderer）。
  // 延迟到达的 moveOrb 若此时 Orb 已隐藏/销毁，manager.moveOrbWindow 内部会丢弃。
  ipcMain.on(desktopChannels.moveOrb, (event, x: unknown, y: unknown) => {
    const senderSurface = windowManager.getSurfaceForWebContents(event.sender.id);
    if (senderSurface !== "orb") {
      console.error(
        `[ipc] moveOrb rejected: sender surface is ${senderSurface ?? "unknown"}, not orb`,
      );
      return;
    }
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      console.error(`[ipc] moveOrb rejected invalid coords: ${JSON.stringify({ x, y })}`);
      return;
    }
    windowManager.moveOrbWindow(x, y);
  });

  // D-3 切片 3（P1-3 修复）：Orb 拖动结束 → 吸附边缘。单向命令。校验 sender=orb。
  ipcMain.on(desktopChannels.dragOrbEnd, (event) => {
    const senderSurface = windowManager.getSurfaceForWebContents(event.sender.id);
    if (senderSurface !== "orb") {
      console.error(
        `[ipc] dragOrbEnd rejected: sender surface is ${senderSurface ?? "unknown"}, not orb`,
      );
      return;
    }
    windowManager.snapOrbWindowToEdge();
  });

  // D-3 切片 3（P1-3 修复）：取 Orb bounds（拖动起点）。invoke，校验 sender=orb，只返 Orb。
  ipcMain.handle(desktopChannels.getOrbBounds, (event) => {
    const senderSurface = windowManager.getSurfaceForWebContents(event.sender.id);
    if (senderSurface !== "orb") {
      console.error(
        `[ipc] getOrbBounds rejected: sender surface is ${senderSurface ?? "unknown"}, not orb`,
      );
      return null;
    }
    return windowManager.getOrbWindowBounds();
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
    ipcMain.removeHandler(desktopChannels.getOrbBounds);
    ipcMain.removeAllListeners(desktopChannels.resizeCardWindow);
    ipcMain.removeAllListeners(desktopChannels.showSurface);
    ipcMain.removeAllListeners(desktopChannels.moveOrb);
    ipcMain.removeAllListeners(desktopChannels.dragOrbEnd);
  };
}
