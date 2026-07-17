import test from "node:test";
import assert from "node:assert/strict";
import { MultiClientUsageService } from "../dist/usageService.js";

/** Minimal in-memory source for testing aggregation without touching the filesystem. */
function makeSource(clientId, displayName, snapshot, { refreshSpy } = {}) {
  let stored = snapshot;
  return {
    clientId,
    displayName,
    available: true,
    async getSnapshot() {
      return stored;
    },
    async refresh() {
      if (refreshSpy) refreshSpy();
      return stored;
    },
    async getHistory(days) {
      return { days: Math.min(90, Math.max(1, days)), daily: stored.tokenUsage.daily ?? [], source: "local_session", quality: "local_estimate", warnings: [] };
    },
    startPolling() {},
    close() {},
    set(snapshot) {
      stored = snapshot;
    },
  };
}

const baseSnapshot = (clientId, displayName, overrides = {}) => ({
  clientId,
  displayName,
  available: true,
  fetchedAt: "2026-07-15T00:00:00.000Z",
  staleAfter: "2026-07-15T00:02:00.000Z",
  planType: null,
  billingMode: null,
  limits: [],
  tokenUsage: { input: null, cachedInput: null, output: null, reasoningOutput: null, total: null, lifetimeTotal: 100, daily: [{ date: "2026-07-15", tokens: 10 }], source: "local_session", quality: "local_estimate" },
  models: null,
  warnings: [],
  ...overrides,
});

test("refresh aggregates multiple sources into one multi-client snapshot", async () => {
  const codex = makeSource("codex", "Codex", baseSnapshot("codex", "Codex", { planType: "plus", tokenUsage: { ...baseSnapshot("codex", "Codex").tokenUsage, lifetimeTotal: 500 } }));
  const zcode = makeSource("zcode", "ZCode", baseSnapshot("zcode", "ZCode", { tokenUsage: { ...baseSnapshot("zcode", "ZCode").tokenUsage, lifetimeTotal: 200 } }));
  const service = new MultiClientUsageService([codex, zcode], { now: () => new Date("2026-07-15T00:00:00.000Z") });
  const snapshot = await service.refresh(true);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.clients.codex.tokenUsage.lifetimeTotal, 500);
  assert.equal(snapshot.clients.zcode.tokenUsage.lifetimeTotal, 200);
  assert.equal(snapshot.clients.codex.planType, "plus");
  service.close();
});

test("refresh coalesces requests started within five seconds", async () => {
  const codex = makeSource("codex", "Codex", baseSnapshot("codex", "Codex"));
  let refreshCount = 0;
  codex.refresh = async () => {
    refreshCount += 1;
    return baseSnapshot("codex", "Codex");
  };
  const now = { value: new Date("2026-07-15T00:00:00.000Z") };
  const service = new MultiClientUsageService([codex], { now: () => now.value });
  const [a, b] = await Promise.all([service.refresh(true), service.refresh(true)]);
  assert.equal(a, b);
  assert.equal(refreshCount, 1);
  now.value = new Date("2026-07-15T00:00:06.000Z");
  await service.refresh(true);
  assert.equal(refreshCount, 2);
  service.close();
});

test("a failing source degrades itself but does not block siblings", async () => {
  const failing = makeSource("codex", "Codex", baseSnapshot("codex", "Codex"));
  failing.refresh = async () => {
    throw new Error("boom");
  };
  const healthy = makeSource("zcode", "ZCode", baseSnapshot("zcode", "ZCode", { tokenUsage: { ...baseSnapshot("zcode", "ZCode").tokenUsage, lifetimeTotal: 999 } }));
  const service = new MultiClientUsageService([failing, healthy], { now: () => new Date("2026-07-15T00:00:00.000Z") });
  const snapshot = await service.refresh(true);
  assert.ok(snapshot.warnings.some((w) => w.code === "SOURCE_REFRESH_FAILED" && w.message.includes("Codex")));
  assert.equal(snapshot.clients.zcode.tokenUsage.lifetimeTotal, 999);
  assert.equal(snapshot.clients.codex, undefined);
  service.close();
});

test("getHistory routes to the requested client and clamps days to 1-90", async () => {
  const codex = makeSource("codex", "Codex", baseSnapshot("codex", "Codex"));
  const service = new MultiClientUsageService([codex], { now: () => new Date("2026-07-15T00:00:00.000Z") });
  const history = await service.getHistory("codex", 200);
  assert.equal(history.days, 90);
  assert.equal(history.clientId, "codex");
  const unknown = await service.getHistory("nope", 7);
  assert.equal(unknown.quality, "unavailable");
  assert.equal(unknown.warnings[0].code, "UNKNOWN_CLIENT");
  service.close();
});

test("stale snapshot is flagged when read after its staleAfter window", async () => {
  const codex = makeSource("codex", "Codex", baseSnapshot("codex", "Codex"));
  const now = { value: new Date("2026-07-15T00:00:00.000Z") };
  const service = new MultiClientUsageService([codex], { now: () => now.value });
  await service.refresh(true);
  now.value = new Date("2026-07-15T00:03:00.000Z"); // past staleAfter
  const snapshot = await service.getSnapshot();
  assert.ok(snapshot.warnings.some((w) => w.code === "STALE"));
  service.close();
});
