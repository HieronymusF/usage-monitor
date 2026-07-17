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
