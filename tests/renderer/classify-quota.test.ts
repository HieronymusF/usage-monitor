/**
 * classify-quota 单元测试。
 *
 * 覆盖：
 * - windowMinutes → QuotaWindowKind 映射（300 / 10080 / 未知 / null → other）
 * - QuotaState 分类：dual / weekly-only / five-only / unavailable
 * - pickQuotaWindows 的主/次/extra 选择（含 other 窗口保留）
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyQuotaState,
  classifyWindowKind,
  pickQuotaWindows,
  toQuotaWindowViewModel,
} from "../../renderer/src/domain/classify-quota.ts";
import type { QuotaWindow } from "../../server/types.ts";

function makeWindow(overrides: Partial<QuotaWindow>): QuotaWindow {
  return {
    id: "test",
    label: "test",
    windowMinutes: 300,
    usedPercent: 50,
    remainingPercent: 50,
    resetsAt: null,
    source: "app_server",
    quality: "official",
    ...overrides,
  };
}

test("classifyWindowKind: 300 → five-hour", () => {
  assert.equal(classifyWindowKind(300), "five-hour");
});

test("classifyWindowKind: 10080 → weekly", () => {
  assert.equal(classifyWindowKind(10080), "weekly");
});

test("classifyWindowKind: 未知分钟数 → other（不丢弃）", () => {
  assert.equal(classifyWindowKind(600), "other");
  assert.equal(classifyWindowKind(1440), "other"); // 1 天
  assert.equal(classifyWindowKind(120), "other"); // 2 小时
  assert.equal(classifyWindowKind(1), "other"); // 离谱值也保留
});

test("classifyWindowKind: null → other（不丢弃，server 端会生成 '未标明窗口' label）", () => {
  assert.equal(classifyWindowKind(null), "other");
});

test("toQuotaWindowViewModel: 已知窗口保留所有字段 + 计算 health", () => {
  const vm = toQuotaWindowViewModel(
    makeWindow({
      windowMinutes: 300,
      label: "5 小时",
      remainingPercent: 42,
      resetsAt: "2026-07-18T10:00:00Z",
    }),
  );
  assert.deepEqual(vm, {
    kind: "five-hour",
    label: "5 小时",
    usedPercent: 50,
    remainingPercent: 42,
    health: "low",
    resetsAt: "2026-07-18T10:00:00Z",
    quality: "official",
  });
});

test("toQuotaWindowViewModel: other 窗口保留 server 原始 label", () => {
  const vm = toQuotaWindowViewModel(
    makeWindow({
      windowMinutes: 1440,
      label: "1 天",
      remainingPercent: 70,
    }),
  );
  assert.equal(vm.kind, "other");
  assert.equal(vm.label, "1 天");
  assert.equal(vm.health, "sufficient");
});

test("toQuotaWindowViewModel: null windowMinutes + '未标明窗口' label 也保留", () => {
  const vm = toQuotaWindowViewModel(
    makeWindow({
      windowMinutes: null,
      label: "未标明窗口",
      usedPercent: null,
      remainingPercent: null,
    }),
  );
  assert.equal(vm.kind, "other");
  assert.equal(vm.label, "未标明窗口");
  assert.equal(vm.health, "unavailable");
});

test("classifyQuotaState: 空数组 → unavailable", () => {
  assert.equal(classifyQuotaState([]), "unavailable");
});

test("classifyQuotaState: 只有 5h → five-only", () => {
  assert.equal(classifyQuotaState([makeWindow({ windowMinutes: 300 })]), "five-only");
});

test("classifyQuotaState: 只有 weekly → weekly-only", () => {
  assert.equal(classifyQuotaState([makeWindow({ windowMinutes: 10080 })]), "weekly-only");
});

test("classifyQuotaState: 同时有 5h + weekly → dual", () => {
  assert.equal(
    classifyQuotaState([makeWindow({ windowMinutes: 300 }), makeWindow({ windowMinutes: 10080 })]),
    "dual",
  );
});

test("classifyQuotaState: 只有 other 窗口 → unavailable（other 不算已知配额）", () => {
  assert.equal(classifyQuotaState([makeWindow({ windowMinutes: 1440 })]), "unavailable");
});

test("classifyQuotaState: 5h + other 窗口 → five-only（other 不影响 QuotaState）", () => {
  assert.equal(
    classifyQuotaState([makeWindow({ windowMinutes: 300 }), makeWindow({ windowMinutes: 1440 })]),
    "five-only",
  );
});

test("pickQuotaWindows: dual → primary=5h, secondary=weekly, extra=[]", () => {
  const result = pickQuotaWindows([
    makeWindow({ id: "5h", windowMinutes: 300, remainingPercent: 42 }),
    makeWindow({ id: "wk", windowMinutes: 10080, remainingPercent: 64 }),
  ]);
  assert.equal(result.primary?.kind, "five-hour");
  assert.equal(result.primary?.remainingPercent, 42);
  assert.equal(result.secondary?.kind, "weekly");
  assert.equal(result.secondary?.remainingPercent, 64);
  assert.equal(result.extra.length, 0);
});

test("pickQuotaWindows: five-only → primary=5h, secondary=null, extra=[]", () => {
  const result = pickQuotaWindows([makeWindow({ windowMinutes: 300 })]);
  assert.equal(result.primary?.kind, "five-hour");
  assert.equal(result.secondary, null);
  assert.equal(result.extra.length, 0);
});

test("pickQuotaWindows: weekly-only → primary=weekly, secondary=null, extra=[]", () => {
  const result = pickQuotaWindows([makeWindow({ windowMinutes: 10080 })]);
  assert.equal(result.primary?.kind, "weekly");
  assert.equal(result.secondary, null);
  assert.equal(result.extra.length, 0);
});

test("pickQuotaWindows: unavailable (空) → primary=null, secondary=null, extra=[]", () => {
  const result = pickQuotaWindows([]);
  assert.equal(result.primary, null);
  assert.equal(result.secondary, null);
  assert.equal(result.extra.length, 0);
});

test("pickQuotaWindows: 5h + other → primary=5h, extra=[other]（不丢未知窗口）", () => {
  const result = pickQuotaWindows([
    makeWindow({ id: "5h", windowMinutes: 300 }),
    makeWindow({ id: "daily", windowMinutes: 1440, label: "1 天" }),
  ]);
  assert.equal(result.primary?.kind, "five-hour");
  assert.equal(result.secondary, null);
  assert.equal(result.extra.length, 1);
  assert.equal(result.extra[0]?.kind, "other");
  assert.equal(result.extra[0]?.label, "1 天");
});

test("pickQuotaWindows: 只有 other → primary=null, extra=[other]（保留信息）", () => {
  const result = pickQuotaWindows([
    makeWindow({ id: "daily", windowMinutes: 1440, label: "1 天" }),
  ]);
  assert.equal(result.primary, null);
  assert.equal(result.secondary, null);
  assert.equal(result.extra.length, 1);
  assert.equal(result.extra[0]?.kind, "other");
});

test("pickQuotaWindows: dual + 多个 other → extra 含所有 other", () => {
  const result = pickQuotaWindows([
    makeWindow({ windowMinutes: 300 }),
    makeWindow({ windowMinutes: 10080 }),
    makeWindow({ id: "d1", windowMinutes: 1440, label: "1 天" }),
    makeWindow({ id: "d2", windowMinutes: null, label: "未标明窗口" }),
  ]);
  assert.equal(result.primary?.kind, "five-hour");
  assert.equal(result.secondary?.kind, "weekly");
  assert.equal(result.extra.length, 2);
  assert.equal(result.extra[0]?.kind, "other");
  assert.equal(result.extra[1]?.kind, "other");
});
