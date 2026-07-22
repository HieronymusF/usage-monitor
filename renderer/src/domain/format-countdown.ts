/**
 * format-countdown — 把 resetsAt (ISO) 格式化为倒计时字符串。
 *
 * 规则（HANDOFF.md §11、visual-spec.md §5）：
 * - 倒计时由 renderer 本地更新，不每秒访问 bridge
 * - "X天Y小时" / "Y小时Z分" / "Z分" 三档，根据剩余时间长短选最相关的两段
 * - null → null（组件显示"重置时间未知"）
 * - 已过期（resetsAt < now）→ null（让组件显示"即将重置"或重新拉取）
 *
 * i18n：返回结构化分段，由组件用 i18n key 拼接（避免在这里硬编码中文）。
 * 例：{ days: 6, hours: 13, minutes: 5 } → 组件用 t("countdown.daysHours", {...}) 渲染。
 */

export interface CountdownParts {
  /** 天数（0 表示不到一天）。 */
  days: number;
  /** 小时（0-23）。 */
  hours: number;
  /** 分钟（0-59）。 */
  minutes: number;
  /** 剩余总秒数，组件可据此决定是否显示秒级精度。 */
  totalSeconds: number;
}

export type FormatCountdownInput = {
  resetsAt: string | null;
  now?: () => Date;
};

/** 计算倒计时分段。resetsAt 为 null 或已过期时返回 null。 */
export function computeCountdownParts(input: FormatCountdownInput): CountdownParts | null {
  const { resetsAt } = input;
  if (resetsAt === null) return null;

  const now = (input.now ?? (() => new Date()))();
  const target = new Date(resetsAt);
  if (!Number.isFinite(target.getTime())) return null;

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return null;

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return { days, hours, minutes, totalSeconds };
}

/**
 * 选最相关的两段做人类可读倒计时。
 * - >= 1 天 → "X天Y小时"
 * - >= 1 小时 → "Y小时Z分"
 * - < 1 小时 → "Z分"
 * 返回的不是已翻译字符串，而是分段对象，让组件用 i18n 拼。
 */
export function pickRelevantParts(parts: CountdownParts): Partial<CountdownParts> {
  if (parts.days >= 1) {
    return { days: parts.days, hours: parts.hours };
  }
  if (parts.hours >= 1) {
    return { hours: parts.hours, minutes: parts.minutes };
  }
  return { minutes: parts.minutes };
}

/**
 * 把 CountdownParts 格式化成人类可读字符串。
 * 用于 Card 的重置倒计时（如"6天13小时后" / "1小时18分后" / "in 1h 18m"）。
 *
 * locale：zh-CN 走中文（"X天Y小时后"），其他走英文 compact（"Xd Yh" / "Xh Ym"）。
 * 过期或无 parts 返回 null（组件用 i18n 的"即将重置"/"重置时间未知"占位）。
 */
export function formatCountdown(parts: CountdownParts | null, locale = "en"): string | null {
  if (parts === null) return null;
  const relevant = pickRelevantParts(parts);
  const isZh = locale.toLowerCase().startsWith("zh");

  if (isZh) {
    if (relevant.days !== undefined && relevant.hours !== undefined) {
      return `${relevant.days}天${relevant.hours}小时后`;
    }
    if (relevant.hours !== undefined && relevant.minutes !== undefined) {
      return `${relevant.hours}小时${relevant.minutes}分后`;
    }
    if (relevant.minutes !== undefined) {
      return `${relevant.minutes}分后`;
    }
    return null;
  }

  // compact 英文
  if (relevant.days !== undefined && relevant.hours !== undefined) {
    return `${relevant.days}d ${relevant.hours}h`;
  }
  if (relevant.hours !== undefined && relevant.minutes !== undefined) {
    return `${relevant.hours}h ${relevant.minutes}m`;
  }
  if (relevant.minutes !== undefined) {
    return `${relevant.minutes}m`;
  }
  return null;
}
