/**
 * classify-health 单元测试。
 *
 * 覆盖 remainingPercent 边界：0 / 19 / 20 / 49 / 50 / 100 / null。
 * 阈值（DEVELOPMENT-PLAN.md §6）：
 *   >= 50 sufficient, 20-49 low, < 20 critical, null unavailable
 */

import test from "node:test";
import assert from "node:assert/strict";
import { classifyHealth } from "../../renderer/src/domain/classify-health.ts";

test("classifyHealth: null → unavailable", () => {
  assert.equal(classifyHealth(null), "unavailable");
});

test("classifyHealth: 0 → critical (strict less than 20)", () => {
  assert.equal(classifyHealth(0), "critical");
});

test("classifyHealth: 19 → critical (just below low boundary)", () => {
  assert.equal(classifyHealth(19), "critical");
});

test("classifyHealth: 20 → low (inclusive lower bound)", () => {
  assert.equal(classifyHealth(20), "low");
});

test("classifyHealth: 49 → low (just below sufficient boundary)", () => {
  assert.equal(classifyHealth(49), "low");
});

test("classifyHealth: 50 → sufficient (inclusive lower bound)", () => {
  assert.equal(classifyHealth(50), "sufficient");
});

test("classifyHealth: 100 → sufficient", () => {
  assert.equal(classifyHealth(100), "sufficient");
});
