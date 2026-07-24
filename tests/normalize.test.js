import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccountUsage, normalizeRateLimits, normalizeThreadTokenUsage } from "../dist/normalize.js";
import { renderUsageCard } from "../dist/markdown.js";

const fixture = (name) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"));

test("300 + 10080 windows are named by duration", () => {
  const result = normalizeRateLimits(fixture("dual-window.json"));
  assert.deepEqual(result.limits.map((item) => [item.label, item.remainingPercent]), [["5 小时", 76], ["每周", 96]]);
});

test("weekly primary does not invent a five-hour window", () => {
  const rate = normalizeRateLimits(fixture("weekly-only.json"));
  assert.equal(rate.limits.length, 1);
  assert.equal(rate.limits[0].label, "每周");
  const card = renderUsageCard({
    schemaVersion: 1,
    fetchedAt: "2026-07-15T00:00:00.000Z",
    staleAfter: "2026-07-15T00:02:00.000Z",
    planType: rate.planType,
    limits: rate.limits,
    tokenUsage: { input: null, cachedInput: null, output: null, reasoningOutput: null, total: null, lifetimeTotal: null, daily: null, source: "none", quality: "unavailable" },
    warnings: [],
  }, new Date("2026-07-15T00:01:00.000Z"));
  assert.match(card, /\| 5 小时 \| 服务未提供 \| ⚪ 不可用 \| — \|/);
  assert.doesNotMatch(card, /5 小时 \| (0|100)%/);
  assert.match(card, /\| 每周 \| 95%（由官方已用比例派生）/);
});

test("unknown buckets survive and invalid percentages are clamped", () => {
  const result = normalizeRateLimits(fixture("unknown-bucket.json"));
  assert.ok(result.limits.some((item) => item.id === "future-bucket:1440" && item.label === "1 天"));
  assert.deepEqual(result.limits.map((item) => item.usedPercent), [0, 100]);
  assert.equal(result.warnings.filter((warning) => warning.code === "INVALID_PERCENT").length, 2);
});

test("persisted snake_case rate limits preserve source and percentage", () => {
  const result = normalizeRateLimits({
    rateLimits: {
      limit_id: "codex",
      plan_type: "pro",
      primary: { used_percent: 5, window_minutes: 10080, resets_at: 1785339360 },
    },
  }, "local_session");
  assert.equal(result.planType, "pro");
  assert.equal(result.limits[0].usedPercent, 5);
  assert.equal(result.limits[0].remainingPercent, 95);
  assert.equal(result.limits[0].source, "local_session");
});

test("account usage supported and unknown payload forms", () => {
  const account = normalizeAccountUsage({
    usage: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 5, reasoningOutputTokens: 1, totalTokens: 16, lifetimeTotal: 99 },
    dailyUsageBuckets: [{ date: "2026-07-15", tokens: 16 }],
  });
  assert.equal(account.source, "account_usage");
  assert.deepEqual(account.daily, [{ date: "2026-07-15", tokens: 16 }]);
  assert.equal(normalizeAccountUsage({ futureField: true }), null);
  assert.deepEqual(
    normalizeThreadTokenUsage({ tokenUsage: { total: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 5, reasoningOutputTokens: 1, totalTokens: 16 } } }),
    { input: 10, cachedInput: 2, output: 5, reasoningOutput: 1, total: 16 },
  );
});
