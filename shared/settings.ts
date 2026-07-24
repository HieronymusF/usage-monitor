/**
 * 用户偏好设置 schema + 校验纯函数（Milestone E-F/G 设置持久化）。
 *
 * 设计依据：DEVELOPMENT-PLAN.md §10 "设置、托盘与国际化"。
 * 文件落盘到 app.getPath("userData")/settings.json（Electron 惯例；
 * Win 上即 %APPDATA%\codex-usage-monitor\）。
 *
 * 单一真相源：主进程 SettingsRepository 是唯一权威，托盘和 renderer 都经它读写。
 * 不保存凭据 / bridge key / 配额快照 / Token 数据（§10 红线 + AGENTS.md 安全红线）。
 *
 * 纪律 B（状态可判别）：每个 enum 字段的合法值是封闭集合，非法值回退默认。
 * 纪律 C（红线无条件强制）：校验在最靠近入口处做，畸形输入不抛、返默认。
 * 纪律 F（纯函数五类输入）：validateSettings 覆盖 null/非对象/字段缺失/非法值/正常值。
 */

/** 主题偏好：auto 跟随系统，light/dark 强制。 */
export type ThemePreference = "auto" | "light" | "dark";
/** 展示模式偏好：auto 前台识别自动切，其余固定 surface。 */
export type DisplayPreference = "auto" | "card" | "indicator-bar" | "orb";
/** 当前关注的客户端（决定 Card 尺寸和数据来源）。 */
export type ClientKind = "codex" | "zcode";
/** 界面语言。 */
export type Language = "zh-CN" | "en";

/** schema 版本；结构变更时升版 + 迁移。 */
export const SETTINGS_VERSION = 1;

/** 可设置的偏好字段 key（setPreference IPC 用）。 */
export type PreferenceKey = "themePreference" | "displayPreference" | "activeClient" | "language";

/**
 * 把系统语言标识（BCP-47，如 app.getPreferredSystemLanguages()[0] 返回的 "zh-CN"/"zh-Hans"/"en-US"）
 * 解析成本应用支持的 Language。
 *
 * 规则：以 "zh" 开头（大小写不敏感）→ zh-CN；其他（含空/无法识别）→ en（产品默认回退）。
 *
 * 放在 shared（而非 electron/main.ts）是为了可单测——测试必须调真实函数，
 * 不能复制三元判断（否则实现位置错误仍假绿）。
 * 用户已保存的 language 走 SettingsRepository.load 的文件读取分支，不经此函数。
 */
export function resolveLanguageFromLocale(locale: string): Language {
  if (typeof locale === "string" && locale.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

/** 持久化的设置（不含任何敏感数据）。 */
export interface Settings {
  version: number;
  themePreference: ThemePreference;
  displayPreference: DisplayPreference;
  activeClient: ClientKind;
  language: Language;
}

/** 默认设置（schema 缺失/损坏/非法字段时的兜底）。 */
export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  themePreference: "auto",
  displayPreference: "auto",
  activeClient: "codex",
  language: "zh-CN",
};

const THEME_PREFERENCES: readonly ThemePreference[] = ["auto", "light", "dark"];
const DISPLAY_PREFERENCES: readonly DisplayPreference[] = ["auto", "card", "indicator-bar", "orb"];
const CLIENT_KINDS: readonly ClientKind[] = ["codex", "zcode"];
const LANGUAGES: readonly Language[] = ["zh-CN", "en"];

function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (THEME_PREFERENCES as readonly string[]).includes(v);
}
function isDisplayPreference(v: unknown): v is DisplayPreference {
  return typeof v === "string" && (DISPLAY_PREFERENCES as readonly string[]).includes(v);
}
function isClientKind(v: unknown): v is ClientKind {
  return typeof v === "string" && (CLIENT_KINDS as readonly string[]).includes(v);
}
function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}

/**
 * 把任意输入（通常 JSON.parse 的结果）校验成 Settings。
 * 纯函数：不抛异常，任何畸形输入都回退 DEFAULT_SETTINGS 对应字段。
 *
 * - 非对象 / null / 数组 → DEFAULT_SETTINGS
 * - 单字段非法 → 该字段回退默认，其余保留（部分恢复，不因一字段丢全部）
 * - version 不匹配 → 仍逐字段校验（当前 v1 无破坏性变更；后续版本在此加迁移）
 */
export function validateSettings(input: unknown): Settings {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ...DEFAULT_SETTINGS };
  }
  const obj = input as Record<string, unknown>;
  return {
    version: SETTINGS_VERSION,
    themePreference: isThemePreference(obj.themePreference)
      ? obj.themePreference
      : DEFAULT_SETTINGS.themePreference,
    displayPreference: isDisplayPreference(obj.displayPreference)
      ? obj.displayPreference
      : DEFAULT_SETTINGS.displayPreference,
    activeClient: isClientKind(obj.activeClient) ? obj.activeClient : DEFAULT_SETTINGS.activeClient,
    language: isLanguage(obj.language) ? obj.language : DEFAULT_SETTINGS.language,
  };
}

/**
 * 校验并规范化单个 preference 字段的新值（setPreference IPC 用）。
 * 返回 null 表示 key/value 非法，调用方应忽略。
 * 返回 { key, value } 表示合法，可直接用于更新。
 */
export function normalizePreference(
  key: unknown,
  value: unknown,
): { key: PreferenceKey; value: string } | null {
  if (typeof key !== "string") return null;
  switch (key) {
    case "themePreference":
      return isThemePreference(value) ? { key, value } : null;
    case "displayPreference":
      return isDisplayPreference(value) ? { key, value } : null;
    case "activeClient":
      return isClientKind(value) ? { key, value } : null;
    case "language":
      return isLanguage(value) ? { key, value } : null;
    default:
      return null;
  }
}
