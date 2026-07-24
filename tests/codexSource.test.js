import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { CodexSource } from "../dist/sources/codexSource.js";

const emptyLocal = {
  tokenUsage: {
    input: null,
    cachedInput: null,
    output: null,
    reasoningOutput: null,
    total: null,
    lifetimeTotal: null,
    daily: [],
    source: "none",
    quality: "unavailable",
  },
  models: null,
  warnings: [],
};

class FakeAppServerClient extends EventEmitter {
  usageCapability = false;
  threadUsage = null;
  rateLimitReads = 0;
  accountUsageReads = 0;

  async readRateLimits() {
    this.rateLimitReads += 1;
    return {
      rateLimits: {
        limitId: "codex",
        planType: "plus",
        primary: { usedPercent: 57, windowDurationMins: 10080, resetsAt: 1784682957 },
      },
    };
  }

  async readAccountUsage() {
    this.accountUsageReads += 1;
    return null;
  }

  close() {}
}

test("Codex source uses app-server quota and remains available without local tokens", async () => {
  const client = new FakeAppServerClient();
  const source = new CodexSource(client, { read: async () => emptyLocal }, {
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
  });
  const snapshot = await source.refresh(true);
  assert.equal(client.rateLimitReads, 1);
  assert.equal(client.accountUsageReads, 1);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.planType, "plus");
  assert.equal(snapshot.limits.length, 1);
  assert.equal(snapshot.limits[0].label, "每周");
  assert.equal(snapshot.limits[0].remainingPercent, 43);
  assert.equal(snapshot.limits[0].source, "app_server");
  source.close();
});

test("Codex source falls back to persisted Pro quota without mislabeling lifetime as current task", async () => {
  const client = new FakeAppServerClient();
  client.readRateLimits = async () => {
    client.rateLimitReads += 1;
    throw new Error("packaged app-server cannot be executed");
  };
  const local = {
    ...emptyLocal,
    tokenUsage: {
      ...emptyLocal.tokenUsage,
      total: 1_000_000_000,
      lifetimeTotal: 1_000_000_000,
      daily: [{ date: "2026-07-24", tokens: 36_400_000 }],
      source: "local_session",
      quality: "local_estimate",
    },
  };
  const logReader = {
    read: async () => local,
    readLatestRateLimits: async () => ({
      observedAt: "2026-07-24T10:13:49.073Z",
      response: {
        rateLimits: {
          limit_id: "codex",
          plan_type: "pro",
          primary: { used_percent: 5, window_minutes: 10080, resets_at: 1785339360 },
        },
      },
    }),
  };
  const source = new CodexSource(client, logReader, {
    now: () => new Date("2026-07-24T10:14:00.000Z"),
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
  });

  const snapshot = await source.refresh(true);
  assert.equal(snapshot.planType, "pro");
  assert.equal(snapshot.limits[0].remainingPercent, 95);
  assert.equal(snapshot.limits[0].source, "local_session");
  assert.equal(snapshot.tokenUsage.total, null);
  assert.equal(snapshot.tokenUsage.lifetimeTotal, 1_000_000_000);
  assert.ok(snapshot.warnings.some((warning) => warning.code === "LOCAL_RATE_LIMIT_FALLBACK"));
  source.close();
});
