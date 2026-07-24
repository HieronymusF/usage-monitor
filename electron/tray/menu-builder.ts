/**
 * 托盘菜单模板构造（纯函数，Milestone E-F）。
 *
 * 设计依据：DEVELOPMENT-PLAN.md §10 托盘菜单规范。
 *   打开Card / 展示模式(Auto|Card|Bar|Orb) / 客户端(Codex|ZCode) /
 *   主题(Auto|Light|Dark) / 语言(简体中文|English) / 刷新 / 退出。
 *
 * 菜单文案在主进程渲染（不经过 renderer 的 react-i18next），
 * 用内嵌中英文字典按 settings.language 选择。当前选中项打 ✓。
 *
 * 纯函数：接受 settings + callbacks，返回 Electron 的 MenuItemConstructorOptions[]。
 * 不直接 new Menu/Tray（那是 index.ts 的事），便于在 node:test 中断言菜单结构。
 */
import type { MenuItemConstructorOptions } from "electron";
import type {
  ClientKind,
  DisplayPreference,
  Language,
  Settings,
  ThemePreference,
} from "../../shared/settings.js";

/** 语言文案表（主进程内嵌，不依赖 react-i18next）。 */
interface TrayStrings {
  openCard: string;
  displayMode: string;
  client: string;
  theme: string;
  language: string;
  refresh: string;
  autoLaunch: string;
  quit: string;
  /** 展示模式子项标签（auto/card/bar/orb → 本地化）。 */
  displayAuto: string;
  displayCard: string;
  displayBar: string;
  displayOrb: string;
}

const STRINGS: Record<Language, TrayStrings> = {
  "zh-CN": {
    openCard: "打开卡片",
    displayMode: "展示模式",
    client: "客户端",
    theme: "主题",
    language: "语言",
    refresh: "刷新",
    autoLaunch: "开机启动",
    quit: "退出",
    displayAuto: "自动",
    displayCard: "卡片",
    displayBar: "指示条",
    displayOrb: "悬浮球",
  },
  en: {
    openCard: "Open Card",
    displayMode: "Display mode",
    client: "Client",
    theme: "Theme",
    language: "Language",
    refresh: "Refresh",
    autoLaunch: "Launch at startup",
    quit: "Quit",
    displayAuto: "Auto",
    displayCard: "Card",
    displayBar: "Bar",
    displayOrb: "Orb",
  },
};

/** 主题子项的显示名（auto/light/dark → 本地化）。 */
const THEME_LABELS: Record<Language, Record<ThemePreference, string>> = {
  "zh-CN": { auto: "自动", light: "浅色", dark: "深色" },
  en: { auto: "Auto", light: "Light", dark: "Dark" },
};

const CLIENT_LABELS: Record<Language, Record<ClientKind, string>> = {
  "zh-CN": { codex: "Codex", zcode: "ZCode" },
  en: { codex: "Codex", zcode: "ZCode" },
};

/** 语言子项在菜单里显示的自身名称（固定，不随当前语言变）。 */
const LANGUAGE_SELF_LABELS: Record<Language, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

/**
 * 托盘菜单点击回调（由 main.ts 注入实现）。
 * 纯函数只生成模板并把这些回调绑到对应菜单项的 click。
 */
export interface TrayMenuCallbacks {
  /** 打开 Card 窗口。 */
  openCard(): void;
  /** 切换展示模式偏好（写入 settings + 响应，如启停 watcher）。 */
  setDisplayPreference(pref: DisplayPreference): void;
  /** 切换关注客户端。 */
  setActiveClient(client: ClientKind): void;
  /** 切换主题偏好。 */
  setThemePreference(pref: ThemePreference): void;
  /** 切换界面语言。 */
  setLanguage(lang: Language): void;
  /** 刷新用量数据。 */
  refresh(): void;
  /** 启用/关闭 Windows 开机自启。 */
  setAutoLaunch(enabled: boolean): void;
  /** 退出应用。 */
  quit(): void;
}

/**
 * 构造托盘菜单模板。纯函数：相同 settings + callbacks → 相同结构。
 * 当前选中项用 type:"radio" + checked:true 表达（Electron 单选语义）。
 */
export function buildTrayMenuTemplate(
  settings: Settings,
  callbacks: TrayMenuCallbacks,
): MenuItemConstructorOptions[] {
  const s = STRINGS[settings.language];
  const themeLabels = THEME_LABELS[settings.language];
  const clientLabels = CLIENT_LABELS[settings.language];

  const displayItems: MenuItemConstructorOptions[] = (
    ["auto", "card", "indicator-bar", "orb"] as const
  ).map((pref) => ({
    label: displayLabel(s, pref),
    type: "radio" as const,
    checked: settings.displayPreference === pref,
    click: () => callbacks.setDisplayPreference(pref),
  }));

  const clientItems: MenuItemConstructorOptions[] = (["codex", "zcode"] as const).map((client) => ({
    label: clientLabels[client],
    type: "radio" as const,
    checked: settings.activeClient === client,
    click: () => callbacks.setActiveClient(client),
  }));

  const themeItems: MenuItemConstructorOptions[] = (["auto", "light", "dark"] as const).map(
    (pref) => ({
      label: themeLabels[pref],
      type: "radio" as const,
      checked: settings.themePreference === pref,
      click: () => callbacks.setThemePreference(pref),
    }),
  );

  const languageItems: MenuItemConstructorOptions[] = (["zh-CN", "en"] as const).map((lang) => ({
    label: LANGUAGE_SELF_LABELS[lang],
    type: "radio" as const,
    checked: settings.language === lang,
    click: () => callbacks.setLanguage(lang),
  }));

  return [
    { label: s.openCard, click: () => callbacks.openCard() },
    { type: "separator" },
    { label: s.displayMode, submenu: displayItems },
    { label: s.client, submenu: clientItems },
    { label: s.theme, submenu: themeItems },
    { label: s.language, submenu: languageItems },
    { type: "separator" },
    { label: s.refresh, click: () => callbacks.refresh() },
    {
      label: s.autoLaunch,
      type: "checkbox",
      checked: settings.autoLaunch,
      click: () => callbacks.setAutoLaunch(!settings.autoLaunch),
    },
    { label: s.quit, click: () => callbacks.quit() },
  ];
}

function displayLabel(s: TrayStrings, pref: DisplayPreference): string {
  switch (pref) {
    case "auto":
      return s.displayAuto;
    case "card":
      return s.displayCard;
    case "indicator-bar":
      return s.displayBar;
    case "orb":
      return s.displayOrb;
  }
}

/** 导出文案表（index.ts 构造 tooltip 用，测试断言用）。 */
export { STRINGS as TRAY_STRINGS };
