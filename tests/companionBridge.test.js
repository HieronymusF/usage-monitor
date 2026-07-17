import assert from "node:assert/strict";
import test from "node:test";
import { createCompanionBridge } from "../dist/companionBridge.js";

const codexSnapshot = {
  clientId: "codex",
  displayName: "Codex",
  available: true,
  fetchedAt: "2026-07-15T00:00:00.000Z",
  staleAfter: "2026-07-15T00:02:00.000Z",
  planType: "plus",
  billingMode: "subscription",
  limits: [],
  tokenUsage: { input: null, cachedInput: null, output: null, reasoningOutput: null, total: null, lifetimeTotal: null, daily: null, source: "none", quality: "unavailable" },
  models: null,
  warnings: [],
};

const snapshot = {
  schemaVersion: 2,
  fetchedAt: "2026-07-15T00:00:00.000Z",
  staleAfter: "2026-07-15T00:02:00.000Z",
  clients: { codex: codexSnapshot },
  warnings: [],
};

test("companion bridge is loopback-only, authenticated, refreshable, and closable", async () => {
  let refreshes = 0;
  let closed = false;
  const service = {
    async getSnapshot() {
      return snapshot;
    },
    async refresh() {
      refreshes += 1;
      return snapshot;
    },
    startPolling() {},
    close() {
      closed = true;
    },
  };
  const bridge = await createCompanionBridge({ service, bridgeKey: "test-bridge-key" });
  try {
    const base = `http://${bridge.host}:${bridge.port}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/usage`)).status, 401);
    const headers = { Authorization: `Bearer ${bridge.bridgeKey}` };
    const usage = await fetch(`${base}/usage`, { headers });
    assert.equal(usage.status, 200);
    assert.equal((await usage.json()).clients.codex.planType, "plus");
    const refresh = await fetch(`${base}/refresh`, { method: "POST", headers });
    assert.equal(refresh.status, 200);
    assert.equal(refreshes, 1);
  } finally {
    await bridge.close();
  }
  assert.equal(closed, true);
});

test("companion bridge rejects non-loopback hosts", async () => {
  await assert.rejects(createCompanionBridge({ host: "0.0.0.0" }), /127\.0\.0\.1/);
});
