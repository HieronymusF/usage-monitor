/// <reference types="vite/client" />

import type { MonitorDesktopApi } from "../../shared/desktop";

declare global {
  interface Window {
    monitor: MonitorDesktopApi;
  }
}

export {};
