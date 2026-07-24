import { contextBridge, ipcRenderer } from "electron";
import type {
  CardClientKind,
  DesktopContext,
  MonitorDesktopApi,
  MultiClientSnapshot,
  PreferenceKey,
  PreferenceValue,
  Settings,
  SurfaceKind,
  SystemTheme,
} from "../shared/desktop.js";
import { desktopChannels } from "./channels.js";

const monitorApi: MonitorDesktopApi = {
  getContext: () => ipcRenderer.invoke(desktopChannels.getContext) as Promise<DesktopContext>,
  getUsage: () =>
    ipcRenderer.invoke(desktopChannels.getUsage) as ReturnType<MonitorDesktopApi["getUsage"]>,
  refreshUsage: () =>
    ipcRenderer.invoke(desktopChannels.refreshUsage) as ReturnType<
      MonitorDesktopApi["refreshUsage"]
    >,
  onSystemThemeChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: SystemTheme): void => {
      listener(theme);
    };
    ipcRenderer.on(desktopChannels.systemThemeChanged, handler);
    return () => ipcRenderer.removeListener(desktopChannels.systemThemeChanged, handler);
  },
  // Milestone E-F 验收修复（问题 3）：监听主进程推送的新快照（托盘刷新等触发）。
  onUsageChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: MultiClientSnapshot): void => {
      listener(snapshot);
    };
    ipcRenderer.on(desktopChannels.usageChanged, handler);
    return () => ipcRenderer.removeListener(desktopChannels.usageChanged, handler);
  },
  resizeCardWindow: (kind: CardClientKind) => {
    ipcRenderer.send(desktopChannels.resizeCardWindow, kind);
  },
  showSurface: (kind: SurfaceKind) => {
    ipcRenderer.send(desktopChannels.showSurface, kind);
  },
  moveOrb: (x: number, y: number) => {
    ipcRenderer.send(desktopChannels.moveOrb, x, y);
  },
  dragOrbEnd: () => {
    ipcRenderer.send(desktopChannels.dragOrbEnd);
  },
  getOrbBounds: () =>
    ipcRenderer.invoke(desktopChannels.getOrbBounds) as ReturnType<
      MonitorDesktopApi["getOrbBounds"]
    >,
  suspendHover: () => {
    ipcRenderer.send(desktopChannels.suspendHover);
  },
  resumeHover: (dragged: boolean) => {
    ipcRenderer.send(desktopChannels.resumeHover, dragged);
  },
  // Milestone E-F/G：用户偏好（主进程为单一真相源）。
  getPreferences: () => ipcRenderer.invoke(desktopChannels.getPreferences) as Promise<Settings>,
  setPreference: (key: PreferenceKey, value: PreferenceValue) => {
    ipcRenderer.send(desktopChannels.setPreference, key, value);
  },
  onPreferenceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, next: Settings): void => {
      listener(next);
    };
    ipcRenderer.on(desktopChannels.preferenceChanged, handler);
    return () => ipcRenderer.removeListener(desktopChannels.preferenceChanged, handler);
  },
};

contextBridge.exposeInMainWorld("monitor", monitorApi);
