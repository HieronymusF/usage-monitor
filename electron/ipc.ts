import { BrowserWindow, ipcMain, nativeTheme } from "electron";
import type {
  CardClientKind,
  DesktopContext,
  MultiClientSnapshot,
  PreferenceKey,
  PreferenceValue,
  Settings,
  SystemTheme,
} from "../shared/desktop.js";
import { validateSurfaceKind } from "../shared/desktop.js";
import type { CompanionBridgeClient } from "./bridge.js";
import { desktopChannels } from "./channels.js";
import type { SurfaceWindowManager } from "./windows/manager.js";
import {
  handleGetPreferences,
  handleSetPreference,
  requireTrustedSender,
  allowTrustedSender,
} from "./preferences.js";

function currentSystemTheme(): SystemTheme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

/**
 * Milestone E-F/G：广播偏好变化给所有 renderer 窗口。
 * 导出供 main.ts 的托盘模块和 setPreference handler 复用（单一广播入口，避免遗漏）。
 */
export function broadcastPreferences(next: Settings): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(desktopChannels.preferenceChanged, next);
  }
}

/**
 * Milestone E-F 验收修复：广播新用量快照给所有 renderer（托盘刷新后立即同步）。
 * 导出供 main.ts 托盘 refresh 复用。
 */
export function broadcastUsage(snapshot: MultiClientSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(desktopChannels.usageChanged, snapshot);
  }
}

/**
 * 偏好 IPC 走 main.ts 统一入口的回调签名（问题 2）。
 * ipc.ts 不直接碰 repo/副作用，只转发——确保 repo.update + broadcast + tray.rebuild +
 * theme/display/client 副作用全部由 commitPreference 执行。
 * getPreferences：返回当前 Settings（main.ts 读 repo）。
 * onSetPreference：写偏好（main.ts 调 commitPreference，含全部副作用）。
 */
export interface DesktopIpcCallbacks {
  getPreferences(): Settings;
  onSetPreference(key: PreferenceKey, value: PreferenceValue): void;
}

export function registerDesktopIpc(
  windowManager: SurfaceWindowManager,
  bridgeClient: CompanionBridgeClient,
  callbacks: DesktopIpcCallbacks,
): () => void {
  // 受信任 renderer 解析（所有 IPC sender 校验复用此函数，验收轮 4 P1）。
  const resolveSurface = (id: number) => windowManager.getSurfaceForWebContents(id);

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
  // 验收轮 4 P1：getUsage 校验 sender——未知 sender 拒绝（invoke reject），不读取用量数据。
  ipcMain.handle(desktopChannels.getUsage, (event) => {
    requireTrustedSender(event.sender.id, "getUsage", resolveSurface);
    return bridgeClient.getUsage();
  });
  // Milestone E-F 验收修复（问题 3）：refreshUsage 拿到新快照后立即广播给所有 renderer，
  // 不丢弃返回值、不等下一轮轮询。托盘刷新和 renderer 自身刷新都经此。
  // 验收轮 4 P1：校验 sender——未知 sender 拒绝，不刷新不广播。
  ipcMain.handle(desktopChannels.refreshUsage, async (event) => {
    requireTrustedSender(event.sender.id, "refreshUsage", resolveSurface);
    const snapshot = await bridgeClient.refreshUsage();
    broadcastUsage(snapshot);
    return snapshot;
  });

  // Card 窗口尺寸切换（单向命令，无返回值）。
  // 验收轮 4 P1：校验 sender——未知 sender 忽略+记录，不执行窗口副作用。保留 codex/zcode 参数校验。
  ipcMain.on(desktopChannels.resizeCardWindow, (event, kind: CardClientKind) => {
    if (!allowTrustedSender(event.sender.id, "resizeCardWindow", resolveSurface)) return;
    if (kind === "codex" || kind === "zcode") {
      windowManager.resizeCardWindow(kind);
    }
  });

  // Surface 切换（单向命令，无返回值）。如 edge-capsule 收起 → orb。
  // 验收轮 4 P1：校验 sender——未知 sender 忽略+记录，不执行窗口副作用。
  // 运行时校验：只接受 surfaceKinds 中的值，非法 payload（伪造/类型错误）忽略 + 记录。
  ipcMain.on(desktopChannels.showSurface, (event, kind: unknown) => {
    if (!allowTrustedSender(event.sender.id, "showSurface", resolveSurface)) return;
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

  // Orb 拖动结束 → 保持松手位置并写盘。单向命令。校验 sender=orb。
  ipcMain.on(desktopChannels.dragOrbEnd, (event) => {
    const senderSurface = windowManager.getSurfaceForWebContents(event.sender.id);
    if (senderSurface !== "orb") {
      console.error(
        `[ipc] dragOrbEnd rejected: sender surface is ${senderSurface ?? "unknown"}, not orb`,
      );
      return;
    }
    windowManager.finishOrbWindowDrag();
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

  // Milestone E-F/G：用户偏好 IPC。主进程为单一真相源，经 callbacks 走 main.ts 统一入口。
  // P1（验收轮 3）：sender 校验逻辑在 preferences.ts 纯函数里（handleGetPreferences/handleSetPreference），
  // 这里只做 ipcMain 胶水（resolveSurface 在函数顶部统一定义）。未知 sender：getPreferences 拒绝（抛错），setPreference 忽略+记录。
  ipcMain.handle(desktopChannels.getPreferences, (event): Settings =>
    handleGetPreferences(event.sender.id, resolveSurface, callbacks),
  );

  // setPreference（问题 2）：走 main.ts commitPreference 统一入口。
  // ipc.ts 不单独 update——确保 repo.update + broadcast + tray.rebuild + theme/display/client
  // 副作用全部由 commitPreference 执行。校验 sender + key/value 类型后才转发（非法忽略）。
  ipcMain.on(desktopChannels.setPreference, (event, key: unknown, value: unknown) => {
    handleSetPreference(event.sender.id, key, value, resolveSurface, callbacks);
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
    ipcMain.removeHandler(desktopChannels.getPreferences);
    ipcMain.removeAllListeners(desktopChannels.resizeCardWindow);
    ipcMain.removeAllListeners(desktopChannels.showSurface);
    ipcMain.removeAllListeners(desktopChannels.moveOrb);
    ipcMain.removeAllListeners(desktopChannels.dragOrbEnd);
    ipcMain.removeAllListeners(desktopChannels.setPreference);
  };
}
