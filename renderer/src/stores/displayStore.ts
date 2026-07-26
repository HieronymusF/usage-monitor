/**
 * Display preference store — Milestone E-F。
 *
 * 展示模式偏好（auto / card / indicator-bar / orb）。
 * 主进程为单一真相源：
 *   - CardHeader 的展示模式菜单通过 setPreference 乐观更新并写 IPC；
 *   - 启动和 preferenceChanged 广播通过 hydrateFromPreferences 幂等覆盖。
 *
 * Renderer 只负责菜单状态与 IPC 命令；实际 surface 切换仍由主进程 windowManager 执行。
 */
import { create } from "zustand";
import type { Settings, DisplayPreference } from "../../../shared/desktop";

export interface DisplayState {
  displayPreference: DisplayPreference;
  /** CardHeader 用户操作入口：乐观更新 + 写主进程 IPC。 */
  setPreference(displayPreference: DisplayPreference): void;
  /** Milestone E-F/G：从主进程 Settings 应用（启动 + 广播）。幂等。 */
  hydrateFromPreferences(settings: Settings): void;
}

export const useDisplayStore = create<DisplayState>((set, get) => ({
  displayPreference: "auto",
  setPreference(displayPreference) {
    set({ displayPreference });
    if (typeof window !== "undefined" && window.monitor?.setPreference) {
      window.monitor.setPreference("displayPreference", displayPreference);
    }
  },
  hydrateFromPreferences(settings) {
    if (get().displayPreference === settings.displayPreference) return;
    set({ displayPreference: settings.displayPreference });
  },
}));
