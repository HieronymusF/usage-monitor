/**
 * format-countdown 单元测试。
 *
 * 覆盖：
 * - null resetsAt → null
 * - 已过期 → null
 * - 分段计算（天/小时/分）
 * - pickRelevantParts 的三档选择
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCountdownParts,
  pickRelevantParts,
} from "../../renderer/src/domain/format-countdown.ts";

const NOW = new Date("2026-07-18T08:00:00.000Z");
const now = () => NOW;

test("computeCountdownParts: null → null", () => {
  assert.equal(computeCountdownParts({ resetsAt: null, now }), null);
});

test("computeCountdownParts: 非法 ISO → null", () => {
  assert.equal(computeCountdownParts({ resetsAt: "not-a-date", now }), null);
});

test("computeCountdownParts: 已过期 → null", () => {
  assert.equal(computeCountdownParts({ resetsAt: "2026-07-18T07:00:00.000Z", now }), null);
});

test("computeCountdownParts: 恰好现在 → null（diffMs <= 0）", () => {
  assert.equal(computeCountdownParts({ resetsAt: "2026-07-18T08:00:00.000Z", now }), null);
});

test("computeCountdownParts: 2 小时后 → 0天 2小时 0分", () => {
  const parts = computeCountdownParts({
    resetsAt: "2026-07-18T10:00:00.000Z",
    now,
  });
  assert.deepEqual(parts && { days: parts.days, hours: parts.hours, minutes: parts.minutes }, {
    days: 0,
    hours: 2,
    minutes: 0,
  });
});

test("computeCountdownParts: 6 天 13 小时 5 分后（visual-spec 示例）", () => {
  // 6*86400 + 13*3600 + 5*60 = 518400 + 46800 + 300 = 565500 秒
  const parts = computeCountdownParts({
    resetsAt: "2026-07-24T21:05:00.000Z",
    now,
  });
  assert.deepEqual(parts && { days: parts.days, hours: parts.hours, minutes: parts.minutes }, {
    days: 6,
    hours: 13,
    minutes: 5,
  });
});

test("computeCountdownParts: 45 分钟后", () => {
  const parts = computeCountdownParts({
    resetsAt: "2026-07-18T08:45:00.000Z",
    now,
  });
  assert.deepEqual(parts && { days: parts.days, hours: parts.hours, minutes: parts.minutes }, {
    days: 0,
    hours: 0,
    minutes: 45,
  });
});

test("pickRelevantParts: >= 1 天 → {days, hours}", () => {
  const result = pickRelevantParts({ days: 6, hours: 13, minutes: 5, totalSeconds: 0 });
  assert.deepEqual(result, { days: 6, hours: 13 });
});

test("pickRelevantParts: 0 天 >= 1 小时 → {hours, minutes}", () => {
  const result = pickRelevantParts({ days: 0, hours: 2, minutes: 30, totalSeconds: 0 });
  assert.deepEqual(result, { hours: 2, minutes: 30 });
});

test("pickRelevantParts: < 1 小时 → {minutes}", () => {
  const result = pickRelevantParts({ days: 0, hours: 0, minutes: 45, totalSeconds: 0 });
  assert.deepEqual(result, { minutes: 45 });
});

test("pickRelevantParts: 恰好 1 小时 → {hours, minutes}", () => {
  const result = pickRelevantParts({ days: 0, hours: 1, minutes: 0, totalSeconds: 0 });
  assert.deepEqual(result, { hours: 1, minutes: 0 });
});

test("pickRelevantParts: 恰好 1 天 → {days, hours}", () => {
  const result = pickRelevantParts({ days: 1, hours: 0, minutes: 0, totalSeconds: 0 });
  assert.deepEqual(result, { days: 1, hours: 0 });
});
