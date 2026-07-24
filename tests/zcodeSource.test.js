import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { ZcodeSessionLogReader } from "../dist/sources/zcodeSessionLog.js";

/**
 * Build the sanitized shape emitted by the GLM app-server used by the ZCode
 * desktop client. Real records also carry request/response content, but the
 * reader must touch only these identifiers, timestamps and numeric usage.
 */
const modelIo = (id, usage, { timestamp = "2026-07-15T01:00:00.000Z", model = "GLM-5.2" } = {}) =>
  JSON.stringify({
    type: "model_io",
    requestId: id,
    startedAt: timestamp,
    completedAt: timestamp,
    model: { modelId: model, providerId: "builtin:bigmodel" },
    response: { usage },
  });

const usage = (input, output, { cacheRead = 0, cacheWrite = 0, total = input + output } = {}) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
  totalTokens: total,
});

test("ZCode reader parses GLM-5.2 model_io records and dedupes request ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-dedupe-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(
    file,
    [
      JSON.stringify({ type: "mode", mode: "normal", sessionId: "s1" }),
      modelIo("request-1", usage(100, 10)),
      modelIo("request-1", usage(100, 10)), // duplicate request id -> ignored
      modelIo("request-2", usage(50, 5)),
      JSON.stringify({ type: "user", content: "hi", timestamp: "2026-07-15T01:00:00.000Z" }),
    ].join("\n") + "\n",
  );
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.lifetimeTotal, 165); // (100+10) + (50+5)
  assert.equal(result.tokenUsage.input, 150);
  assert.equal(result.tokenUsage.output, 15);
  assert.equal(result.tokenUsage.quality, "local_estimate");
});

test("ZCode reader breaks usage down per model", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-models-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(
    file,
    [
      modelIo("a", usage(100, 10), { model: "GLM-5.2" }),
      modelIo("b", usage(40, 4), { model: "GLM-5.2-Flash" }),
    ].join("\n") + "\n",
  );
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.deepEqual(result.models, [
    { name: "GLM-5.2", input: 100, output: 10 },
    { name: "GLM-5.2-Flash", input: 40, output: 4 },
  ]);
});

test("ZCode reader buckets per day and persists offsets across reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-daily-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(file, modelIo("a", usage(100, 10), { timestamp: "2026-07-14T01:00:00.000Z" }) + "\n");
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const first = await reader.read(7);
  assert.deepEqual(first.tokenUsage.daily, [{ date: "2026-07-14", tokens: 110 }]);
  // Append a second-day record; the offset cache must avoid re-reading the first.
  await writeFile(file, `${await readFile(file, "utf8")}${modelIo("b", usage(50, 5), { timestamp: "2026-07-15T02:00:00.000Z" })}\n`);
  const second = await reader.read(7);
  assert.equal(second.tokenUsage.lifetimeTotal, 165);
  assert.ok(second.tokenUsage.daily.some((d) => d.date === "2026-07-15" && d.tokens === 55));
});

test("ZCode reader ignores non-model_io lines and records without usable usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-noise-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(
    file,
    [
      JSON.stringify({ type: "user", content: "hi" }),
      JSON.stringify({ type: "model_io", requestId: "x", model: { modelId: "m" }, response: {} }),
      modelIo("y", usage(0, 0)),
      modelIo("z", usage(20, 2)),
    ].join("\n") + "\n",
  );
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.lifetimeTotal, 22);
  assert.deepEqual(result.warnings, []);
});

test("ZCode reader counts request-id-less usage records independently", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-no-id-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(file, `${modelIo("", usage(10, 2))}\n${modelIo("", usage(10, 2))}\n`);
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.lifetimeTotal, 24);
});

test("ZCode cached input contributes to total usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-cached-input-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(file, `${modelIo("cached", usage(100, 10, { cacheRead: 20, cacheWrite: 30 }))}\n`);
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.input, 100);
  assert.equal(result.tokenUsage.cachedInput, 50);
  assert.equal(result.tokenUsage.output, 10);
  // GLM app-server semantics: inputTokens already includes cached input, and
  // totalTokens equals inputTokens + outputTokens. Cache is informational and
  // must not be added a second time.
  assert.equal(result.tokenUsage.lifetimeTotal, 110);
  assert.deepEqual(result.tokenUsage.daily, [{ date: "2026-07-15", tokens: 110 }]);
});

test("ZCode reader rebuilds a version-one cache after total semantics change", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-old-cache-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  const line = `${modelIo("fresh", usage(10, 2, { cacheRead: 5 }))}\n`;
  await writeFile(file, line);
  await writeFile(cache, JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-07-15T00:00:00.000Z",
    lifetimeInput: 999,
    lifetimeOutput: 999,
    lifetimeCachedInput: 999,
    lifetimeTotal: 999,
    daily: {},
    models: {},
    files: { [file]: { offset: Buffer.byteLength(line) } },
  }));
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.lifetimeTotal, 12);
});
