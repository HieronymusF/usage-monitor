/**
 * classify-data-state 单元测试。
 *
 * 覆盖 6 个 DataState：loading / fresh / stale / partial / refresh-error / offline
 *
 * 优先级（从高到低）：
 *   offline / loading > refresh-error > stale > partial > fresh
 *
 * 关键：STALE warning 归 stale（数据过期），不归 partial（某源失败）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { classifyDataState } from "../../renderer/src/domain/classify-data-state.ts";
import type { MultiClientSnapshot } from "../../server/types.ts";

const NOW = new Date("2026-07-18T08:01:00.000Z"); // 在 BASE_TIME 和 staleAfter 之间
const now = () => NOW;

function makeSnapshot(overrides: Partial<MultiClientSnapshot> = {}): MultiClientSnapshot {
  return {
    schemaVersion: 2,
    fetchedAt: "2026-07-18T08:00:00.000Z",
    staleAfter: "2026-07-18T08:02:00.000Z",
    clients: {},
    warnings: [],
    ...overrides,
  };
}

function makeClientSnapshotWithWarning(code: string): MultiClientSnapshot {
  return makeSnapshot({
    clients: {
      zcode: {
        clientId: "zcode",
        displayName: "ZCode",
        available: true,
        fetchedAt: "2026-07-18T08:00:00.000Z",
        staleAfter: "2026-07-18T08:02:00.000Z",
        planType: null,
        billingMode: null,
        limits: [],
        tokenUsage: {
          input: null,
          cachedInput: null,
          output: null,
          reasoningOutput: null,
          total: null,
          lifetimeTotal: null,
          daily: null,
          source: "none",
          quality: "unavailable",
        },
        models: null,
        warnings: [{ code, message: "x" }],
      },
    },
  });
}

test("classifyDataState: 无快照 + 无错误 → loading", () => {
  assert.equal(classifyDataState({ snapshot: null, error: null, now }).state, "loading");
});

test("classifyDataState: 无快照 + 有错误 → offline", () => {
  assert.equal(
    classifyDataState({ snapshot: null, error: new Error("bridge down"), now }).state,
    "offline",
  );
});

test("classifyDataState: 有快照 + 无错误 + 未过期 → fresh", () => {
  assert.equal(classifyDataState({ snapshot: makeSnapshot(), error: null, now }).state, "fresh");
});

test("classifyDataState: 有快照 + 已过 staleAfter → stale", () => {
  const later = () => new Date("2026-07-18T08:03:00.000Z"); // 过 staleAfter
  assert.equal(
    classifyDataState({ snapshot: makeSnapshot(), error: null, now: later }).state,
    "stale",
  );
});

test("classifyDataState: 有快照 + 刷新错误 → refresh-error（保留快照）", () => {
  assert.equal(
    classifyDataState({ snapshot: makeSnapshot(), error: new Error("net"), now }).state,
    "refresh-error",
  );
});

test("classifyDataState: 有快照 + SOURCE_REFRESH_FAILED warning → partial", () => {
  const snapshot = makeSnapshot({
    warnings: [{ code: "SOURCE_REFRESH_FAILED", message: "x" }],
  });
  assert.equal(classifyDataState({ snapshot, error: null, now }).state, "partial");
  assert.equal(classifyDataState({ snapshot, error: null, now }).hasPartialWarning, true);
});

test("classifyDataState: 客户端 warnings 里的 SOURCE_REFRESH_FAILED 也触发 partial", () => {
  const snapshot = makeClientSnapshotWithWarning("SOURCE_REFRESH_FAILED");
  assert.equal(classifyDataState({ snapshot, error: null, now }).state, "partial");
});

test("classifyDataState: STALE warning 归 stale，不归 partial（语义不同）", () => {
  const snapshot = makeSnapshot({
    warnings: [{ code: "STALE", message: "stale" }],
  });
  // staleAfter 仍未过期，但 STALE warning 应触发 stale
  assert.equal(classifyDataState({ snapshot, error: null, now }).state, "stale");
  assert.equal(classifyDataState({ snapshot, error: null, now }).hasPartialWarning, false);
});

test("classifyDataState: 客户端 warnings 里的 STALE 也归 stale", () => {
  const snapshot = makeClientSnapshotWithWarning("STALE");
  assert.equal(classifyDataState({ snapshot, error: null, now }).state, "stale");
});

test("classifyDataState: 优先级 - refresh-error 高于 stale", () => {
  // 同时有刷新错误 + STALE warning → refresh-error 优先
  const snapshot = makeSnapshot({
    warnings: [{ code: "STALE", message: "x" }],
  });
  assert.equal(
    classifyDataState({ snapshot, error: new Error("refresh failed"), now }).state,
    "refresh-error",
  );
});

test("classifyDataState: 优先级 - stale 高于 partial", () => {
  // 同时有 STALE + SOURCE_REFRESH_FAILED → stale 优先（数据过期比部分失败更严重）
  const snapshot = makeSnapshot({
    warnings: [
      { code: "STALE", message: "stale" },
      { code: "SOURCE_REFRESH_FAILED", message: "partial" },
    ],
  });
  assert.equal(classifyDataState({ snapshot, error: null, now }).state, "stale");
});
