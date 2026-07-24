/**
 * Display preference store — Milestone E-F。
 *
 * 展示模式偏好（auto / card / indicator-bar / orb）。
 * 主进程为单一真相源：本 store 只 hydrate（启动 + onPreferenceChanged），无独立 setter
 *（displayPreference 只能从托盘改；renderer 不提供切换 UI）。
 *
 * 当前主要消费者是潜在的未来逻辑（如 surface 路由提示）；Milestone E-F 阶段 renderer
 * 主要被 ThemeProvider hydrate 以保持偏好同步，实际 surface 切换由主进程 windowManager 执行。
 */
import { create } from "zustand";
import type { Settings, DisplayPreference } from "../../../shared/desktop";

export interface DisplayState {
  displayPreference: DisplayPreference;
  /** Milestone E-F/G：从主进程 Settings 应用（启动 + 广播）。幂等。 */
  hydrateFromPreferences(settings: Settings): void;
}

export const useDisplayStore = create<DisplayState>((set, get) => ({
  displayPreference: "auto",
  hydrateFromPreferences(settings) {
    if (get().displayPreference === settings.displayPreference) return;
    set({ displayPreference: settings.displayPreference });
  },
}));
