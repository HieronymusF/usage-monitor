/**
 * format-token — token 数字格式化为人类可读字符串。
 *
 * 规则（visual-spec.md §1）：
 * - 启用 Tabular + Lining numerals（由组件通过 CSS font-variant-numeric 实现，这里只出字符串）
 * - 大数字用 K/M/B 简写：1234567 → "1.2M"
 * - 小于 1000 直接显示原数
 * - null → "—"（由组件用 i18n key 替换为"服务未提供"，这里返回 null 让组件决定）
 *
 * 不在这里做 i18n，因为：
 * 1. 数字本身是 locale-aware 的（小数点/千分位），由 Intl.NumberFormat 处理
 * 2. 单位 K/M 是英文缩写，中英文都用同一套
 * 3. 完整 i18n 文案（如"今日"/"累计"）由组件用 react-i18next 的 t() 处理
 */

export interface FormatTokenOptions {
  /** locale，默认 en-US（K/M 简写）。zh-CN 也用相同简写。 */
  locale?: string;
}

/**
 * 单位简写配置。
 * visual-spec §6 的视觉示例（"23.8M" / "392.8M"）表明 M/B 用 1 位小数；
 * K 用 1 位小数会让 "1.5K" 比 "1500" 更紧凑但偶尔显得啰嗦，所以 K 默认 0 位小数。
 */
const UNITS = [
  { threshold: 1_000_000_000, suffix: "B", maxFractionDigits: 1 },
  { threshold: 1_000_000, suffix: "M", maxFractionDigits: 1 },
  { threshold: 1_000, suffix: "K", maxFractionDigits: 0 },
] as const;

/** 把 token 数格式化为带简写单位的字符串。 */
export function formatToken(
  tokens: number | null,
  options: FormatTokenOptions = {},
): string | null {
  if (tokens === null) return null;
  if (!Number.isFinite(tokens)) return null;
  if (tokens < 0) return null;

  const { locale = "en-US" } = options;

  for (const { threshold, suffix, maxFractionDigits } of UNITS) {
    if (tokens >= threshold) {
      const value = tokens / threshold;
      const formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxFractionDigits,
      }).format(value);
      return `${formatted}${suffix}`;
    }
  }

  // 小于 1000：原数，不带千分位（避免 "1,234" 在紧凑指示条里占宽）
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(tokens);
}

/** 格式化完整数字（带千分位），用于 tooltip 或详细面板。 */
export function formatTokenFull(tokens: number | null, locale = "en-US"): string | null {
  if (tokens === null) return null;
  if (!Number.isFinite(tokens) || tokens < 0) return null;
  return new Intl.NumberFormat(locale).format(tokens);
}
