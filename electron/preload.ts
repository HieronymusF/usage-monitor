import { contextBridge, ipcRenderer } from "electron";
import type {
  CardClientKind,
  DesktopContext,
  MonitorDesktopApi,
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
  resizeCardWindow: (kind: CardClientKind) => {
    ipcRenderer.send(desktopChannels.resizeCardWindow, kind);
  },
  showSurface: (kind: SurfaceKind) => {
    ipcRenderer.send(desktopChannels.showSurface, kind);
  },
};

contextBridge.exposeInMainWorld("monitor", monitorApi);
