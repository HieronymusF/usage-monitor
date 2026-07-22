/**
 * format-token 单元测试。
 *
 * 覆盖：
 * - null → null
 * - < 1000 → 原数无简写
 * - >= 1000 → K/M/B 简写
 * - 有效数字位数
 * - 负数 / NaN → null
 */

import test from "node:test";
import assert from "node:assert/strict";
import { formatToken, formatTokenFull } from "../../renderer/src/domain/format-token.ts";

test("formatToken: null → null", () => {
  assert.equal(formatToken(null), null);
});

test("formatToken: 负数 → null", () => {
  assert.equal(formatToken(-1), null);
});

test("formatToken: NaN → null", () => {
  assert.equal(formatToken(Number.NaN), null);
});

test("formatToken: < 1000 → 原数无简写", () => {
  assert.equal(formatToken(0), "0");
  assert.equal(formatToken(42), "42");
  assert.equal(formatToken(999), "999");
});

test("formatToken: 1000-999999 → K 简写（无小数）", () => {
  assert.equal(formatToken(1500), "2K"); // 四舍五入到整数
  assert.equal(formatToken(700_000), "700K");
});

test("formatToken: 1_000_000+ → M 简写（1 位小数）", () => {
  assert.equal(formatToken(1_650_000), "1.7M");
  assert.equal(formatToken(23_800_000), "23.8M");
});

test("formatToken: 1_000_000_000+ → B 简写（1 位小数）", () => {
  assert.equal(formatToken(1_500_000_000), "1.5B");
});

test("formatToken: M 小数四舍五入", () => {
  assert.equal(formatToken(1_650_000), "1.7M"); // 1.65 → 1.7
  assert.equal(formatToken(1_640_000), "1.6M"); // 1.64 → 1.6
});

test("formatToken: 视觉规范示例值（visual-spec §6 示例）", () => {
  // visual-spec §6: "今日 23.8M" / "累计 392.8M"
  assert.equal(formatToken(23_800_000), "23.8M");
  assert.equal(formatToken(392_800_000), "392.8M");
});

test("formatTokenFull: 带千分位的完整数字", () => {
  assert.equal(formatTokenFull(1_650_000), "1,650,000");
  assert.equal(formatTokenFull(392_800_000), "392,800,000");
});

test("formatTokenFull: null → null", () => {
  assert.equal(formatTokenFull(null), null);
});
