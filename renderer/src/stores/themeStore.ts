/**
 * Theme store — Light/Dark/Auto 三态主题状态（zustand）。
 *
 * 设计依据：visual-spec §4 "Auto 不是第三套颜色，它解析为 Light 或 Dark"。
 *
 * preference: 用户偏好（auto / light / dark），未来持久化到 settings.json。
 * resolved: 实际生效的主题（light / dark），由 preference 解析得出：
 *   - preference=light → resolved=light
 *   - preference=dark  → resolved=dark
 *   - preference=auto  → resolved=systemTheme（由 ThemeProvider 注入）
 *
 * applyTheme 把 resolved 写到 <html> 的 class 上（.light 或 .dark），
 * globals.css 据此切换 CSS variables。
 *
 * 测试通过注入 systemTheme + DOM mock 验证三态（见 tests/renderer/theme-store.test.ts）。
 */

import { create } from "zustand";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** 注入：系统主题（auto 模式下用它）。ThemeProvider 从 nativeTheme 推送。 */
  systemTheme: ResolvedTheme;
  /** 设置用户偏好，自动重算 resolved 并应用到 DOM。 */
  setPreference(preference: ThemePreference): void;
  /** 更新系统主题（auto 模式下触发重算）。 */
  setSystemTheme(systemTheme: ResolvedTheme): void;
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
    const resolved = resolveTheme(preference, get().systemTheme);
    set({ preference, resolved });
    get().applyTheme();
  },

  setSystemTheme(systemTheme) {
    const { preference } = get();
    const resolved = resolveTheme(preference, systemTheme);
    set({ systemTheme, resolved });
    get().applyTheme();
  },

  applyTheme(domSink = browserDomSink) {
    domSink.setClass(get().resolved);
  },
}));
