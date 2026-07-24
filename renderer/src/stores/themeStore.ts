/**
 * Theme store — Light/Dark/Auto 三态主题状态（zustand）。
 *
 * 设计依据：visual-spec §4 "Auto 不是第三套颜色，它解析为 Light 或 Dark"。
 *
 * Milestone E-F/G：主进程为偏好单一真相源。
 *   - preference 由 ThemeProvider 从主进程 preferences hydrate（启动 + onPreferenceChanged）。
 *   - setPreference（用户 UI 操作）：乐观更新本地 + 写主进程 IPC 持久化；
 *     主进程广播回来时由 hydrateFromPreferences 应用（幂等，与乐观值一致则无操作）。
 *   - resolved: 实际生效主题（light / dark），由 preference 解析：
 *     preference=light/dark → 该值；preference=auto → systemTheme。
 *
 * applyTheme 把 resolved 写到 <html> 的 class 上（.light 或 .dark），
 * globals.css 据此切换 CSS variables。
 *
 * 测试通过注入 systemTheme + DOM mock 验证三态（见 tests/renderer/theme-store.test.ts）。
 */

import { create } from "zustand";
import type { Settings } from "../../../shared/desktop";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** 注入：系统主题（auto 模式下用它）。ThemeProvider 从 nativeTheme 推送。 */
  systemTheme: ResolvedTheme;
  /**
   * 用户 UI 操作入口（乐观更新 + 写主进程 IPC）。
   * 立即本地应用 preference（UI 即时响应），同时发 IPC 持久化；
   * 主进程广播回来时 hydrateFromPreferences 幂等覆盖。
   */
  setPreference(preference: ThemePreference): void;
  /** 更新系统主题（auto 模式下触发重算）。ThemeProvider 从 onSystemThemeChange 推送。 */
  setSystemTheme(systemTheme: ResolvedTheme): void;
  /**
   * Milestone E-F/G：从主进程 Settings 应用偏好（启动 + 广播）。
   * 纯同步应用（不调 IPC），幂等（值一致则无副作用）。
   */
  hydrateFromPreferences(settings: Settings): void;
  /**
   * 把 resolved 写到 <html> class 上。
   * 默认操作 document.documentElement；测试可注入 domSink 避免污染全局。
   */
  applyTheme(domSink?: ThemeDomSink): void;
}

/**
 * DOM 操作接口，便于测试注入。生产环境用默认实现（操作 document.documentElement）。
 * 纪律 B：不直接耦合 document，让 store 可在 node:test 下纯函数测试。
 */
export interface ThemeDomSink {
  setClass(className: "light" | "dark"): void;
}

/** 默认 DOM sink：操作真实 document.documentElement。 */
const browserDomSink: ThemeDomSink = {
  setClass(className) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(className);
  },
};

/** 根据 preference + systemTheme 计算 resolved（纯函数，便于测试）。 */
export function resolveTheme(
  preference: ThemePreference,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  if (preference === "auto") return systemTheme;
  return preference;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: "auto",
  resolved: "light",
  systemTheme: "light",

  setPreference(preference) {
    // 乐观更新：立即本地应用（UI 即时响应）。
    const resolved = resolveTheme(preference, get().systemTheme);
    set({ preference, resolved });
    get().applyTheme();
    // Milestone E-F/G：写主进程持久化（主进程广播回来时 hydrate 幂等覆盖）。
    // window.monitor 在 preload 注入；node:test 下不存在则跳过（纯状态测试不依赖 IPC）。
    if (typeof window !== "undefined" && window.monitor?.setPreference) {
      window.monitor.setPreference("themePreference", preference);
    }
  },

  setSystemTheme(systemTheme) {
    const { preference } = get();
    const resolved = resolveTheme(preference, systemTheme);
    set({ systemTheme, resolved });
    get().applyTheme();
  },

  hydrateFromPreferences(settings) {
    // 主进程推送的偏好应用（启动 + onPreferenceChanged）。幂等：值一致则无操作。
    const prev = get();
    if (prev.preference === settings.themePreference) return;
    const resolved = resolveTheme(settings.themePreference, prev.systemTheme);
    set({ preference: settings.themePreference, resolved });
    get().applyTheme();
  },

  applyTheme(domSink = browserDomSink) {
    domSink.setClass(get().resolved);
  },
}));
