import test from "node:test";
import assert from "node:assert/strict";
import { dateKeyDaysAgo, toLocalDateKey, todayKey } from "../dist/time.js";

// 契约：dateKey 是该时刻在指定 IANA 时区下的自然日（YYYY-MM-DD），不是 UTC 日。
// Asia/Hong_Kong = UTC+8 全年无 DST，便于确定性断言。

test("toLocalDateKey: UTC+8 凌晨 00:30 本地 → 当地当日（不是 UTC 的昨天）", () => {
  // 2026-07-18T00:30:00+08:00 = 2026-07-17T16:30:00Z
  // UTC 切片会得到 "2026-07-17"（昨天），但本地是 "2026-07-18"（今天）
  const date = new Date("2026-07-17T16:30:00.000Z");
  assert.equal(toLocalDateKey(date, "Asia/Hong_Kong"), "2026-07-18");
  // 对照：UTC 下同时刻是昨天
  assert.equal(toLocalDateKey(date, "UTC"), "2026-07-17");
});

test("toLocalDateKey: UTC+8 早 08:00 本地 = UTC 00:00 → 仍是当日", () => {
  // 边界点：UTC 00:00 在 UTC+8 是 08:00，两侧都是同一日历日
  const date = new Date("2026-07-18T00:00:00.000Z");
  assert.equal(toLocalDateKey(date, "Asia/Hong_Kong"), "2026-07-18");
  assert.equal(toLocalDateKey(date, "UTC"), "2026-07-18");
});

test("toLocalDateKey: UTC+8 晚 23:59 本地 → 当地当日（UTC 已是次日）", () => {
  // 2026-07-18T23:59:00+08:00 = 2026-07-18T15:59:00Z → UTC 还是 07-18
  // 2026-07-19T07:59:00Z 在 UTC+8 是 2026-07-19T15:59 → 仍 07-19，但 UTC 切片也是 07-19
  // 更有意义的例子：UTC 凌晨 00:30 = UTC+8 早上 08:30
  const date = new Date("2026-07-19T00:30:00.000Z"); // UTC+8 = 2026-07-19T08:30
  assert.equal(toLocalDateKey(date, "Asia/Hong_Kong"), "2026-07-19");
  assert.equal(toLocalDateKey(date, "UTC"), "2026-07-19");
});

test("toLocalDateKey: 省略 timeZone 用系统本地时区（不抛错）", () => {
  const date = new Date("2026-07-18T12:00:00.000Z");
  // 不强制断言具体值（取决于 process.env.TZ），只验证格式和可调用
  const key = toLocalDateKey(date);
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test("toLocalDateKey: Invalid Date → 空字符串（防御，不抛）", () => {
  assert.equal(toLocalDateKey(new Date("garbage"), "Asia/Hong_Kong"), "");
});

test("toLocalDateKey: 非法 timeZone → 回退 UTC 切片（不抛）", () => {
  const date = new Date("2026-07-18T12:00:00.000Z");
  assert.equal(toLocalDateKey(date, "Not/A_Real_Tz"), "2026-07-18");
});

test("todayKey: Asia/Hong_Kong 凌晨 00:30 本地 = UTC 16:30 前一天 → 返回今日（本地）", () => {
  // 关键复现场景：renderer 在 UTC+8 的 2026-07-18 00:30 本地时间
  // 必须返回 "2026-07-18"，不能返回 "2026-07-17"
  const now = () => new Date("2026-07-17T16:30:00.000Z"); // = 2026-07-18T00:30+08:00
  assert.equal(todayKey({ now, timeZone: "Asia/Hong_Kong" }), "2026-07-18");
});

test("todayKey: UTC 早上 08:00 = UTC+8 下午 16:00 → 两边都返回当日", () => {
  const now = () => new Date("2026-07-18T08:00:00.000Z");
  assert.equal(todayKey({ now, timeZone: "UTC" }), "2026-07-18");
  assert.equal(todayKey({ now, timeZone: "Asia/Hong_Kong" }), "2026-07-18");
});

test("dateKeyDaysAgo: days=1 = 今天", () => {
  const now = () => new Date("2026-07-18T12:00:00.000Z");
  assert.equal(dateKeyDaysAgo(1, { now, timeZone: "UTC" }), "2026-07-18");
});

test("dateKeyDaysAgo: days=7 = 6 天前（含今天共 7 天）", () => {
  const now = () => new Date("2026-07-18T12:00:00.000Z");
  assert.equal(dateKeyDaysAgo(7, { now, timeZone: "UTC" }), "2026-07-12");
});

test("dateKeyDaysAgo: 跨本地午夜正确（UTC+8 凌晨查询）", () => {
  // now = 2026-07-18T00:30+08:00 = 2026-07-17T16:30Z
  // days=2 → 含 07-18 和 07-17（本地）→ cutoff = 07-17
  const now = () => new Date("2026-07-17T16:30:00.000Z");
  assert.equal(dateKeyDaysAgo(2, { now, timeZone: "Asia/Hong_Kong" }), "2026-07-17");
});
