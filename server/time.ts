/**
 * 共享时间工具 — server daily bucket 与 renderer 今日判定必须使用同一契约。
 *
 * 契约（2026-07-18 复验修复）：
 * - "今日"按用户本地自然日（本地时区 00:00–24:00），不是 UTC 日。
 * - dateKey 形如 "YYYY-MM-DD"，是 IANA 时区下该时刻的日历日期。
 * - 默认时区是 undefined（系统本地时区），生产环境跟随用户机器。
 * - 测试通过显式注入 timeZone（如 "Asia/Hong_Kong"）保证确定性，不依赖 process.env.TZ。
 *
 * 历史背景：之前 server/sessionLogReader.ts:194 用 toISOString().slice(0,10)
 * 取 UTC 日，renderer 的 todayKey 也取 UTC 日，导致在 UTC+8 凌晨 00:00–08:00
 * 之间"今日"显示成昨天。统一改为本地自然日后消除该不一致。
 *
 * 部署：放在 server/ 内，编译到 dist/；renderer 通过相对路径 import 同一份源码，
 * 保证两端零分歧。
 */

export interface LocalDateKeyOptions {
  /** 注入当前时间，便于测试。默认 () => new Date()。 */
  now?: () => Date;
  /**
   * IANA 时区（如 "Asia/Hong_Kong"、"UTC"）。
   * 省略 = 系统本地时区，生产环境跟随用户机器。
   * 注意：在 exactOptionalPropertyTypes 下，传 undefined 和不传是不同的；
   * 调用方应按"有值就传，没值就不设这个 key"的约定构造对象。
   */
  timeZone?: string | undefined;
}

/**
 * 把任意 Date 转成指定时区下的 "YYYY-MM-DD" 日历日期 key。
 *
 * 实现用 Intl.DateTimeFormat 的 year/month/day 部分，这是 Node/浏览器里
 * 唯一不依赖完整 tzdata 解析、又能正确处理 IANA 时区的标准 API。
 * 用 en-CA locale 保证 year-month-day 顺序且零填充。
 *
 * @param date 任意时刻
 * @param timeZone IANA 时区；省略 = 系统本地时区
 * @returns "YYYY-MM-DD"（零填充月/日）；非法 timeZone 回退到 UTC 日（防御）
 */
export function toLocalDateKey(date: Date, timeZone?: string): string {
  // Invalid Date（如 new Date("garbage")）的 getTime() 是 NaN；防御性兜底，
  // 避免后续 toISOString 抛 RangeError。返回空字符串让调用方识别为缺失。
  if (!Number.isFinite(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value ?? "";
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // 非法 timeZone 会抛 RangeError；调用方应传合法值，这里防御性兜底
  }
  return date.toISOString().slice(0, 10);
}

/**
 * 生成"今日"的 dateKey。生产环境跟随系统时区，测试通过 timeZone 参数注入。
 *
 * 与 server/sessionLogReader.ts 的 bucket key、renderer 的 todayKey 必须用同一实现，
 * 才能保证"今日 token"显示的就是 server 当前分桶里"今日"那一条。
 */
export function todayKey(options: LocalDateKeyOptions = {}): string {
  const now = options.now ?? (() => new Date());
  return toLocalDateKey(now(), options.timeZone);
}

/**
 * 把"过去 N 天"的边界转成 dateKey（含今天共 N 天）。
 * 用于 prune（清理超过 retention 的旧 bucket）和 toUsage（筛选最近 N 天）。
 *
 * 用本地日历日减 (days-1) 天：days=1 → 今天，days=7 → 今天到 6 天前。
 * 注意：86_400_000 ms 是一个太阳日，DST 切换日（如夏令时）会偏移 1 小时，
 * 但对"过去 N 天"范围筛选的影响可忽略（最多让边界当天的 bucket 多保留/少保留一天）。
 */
export function dateKeyDaysAgo(days: number, options: LocalDateKeyOptions = {}): string {
  const now = options.now ?? (() => new Date());
  const ms = now().getTime() - (days - 1) * 86_400_000;
  return toLocalDateKey(new Date(ms), options.timeZone);
}
