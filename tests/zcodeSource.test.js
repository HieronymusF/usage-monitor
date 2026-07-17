import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { ZcodeSessionLogReader } from "../dist/sources/zcodeSessionLog.js";

/**
 * Build a ZCode assistant line. The same message id repeats across adjacent
 * content blocks (thinking + tool_use) but carries identical usage, so the
 * reader must count it once.
 */
const assistant = (id, usage, { timestamp = "2026-07-15T01:00:00.000Z", model = "deepseek-v4-pro" } = {}) =>
  JSON.stringify({
    type: "assistant",
    timestamp,
    message: { id, model, role: "assistant", usage },
  });

const usage = (input, output, { cacheRead = 0, cacheCreate = 0 } = {}) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheCreate,
});

test("ZCode reader dedupes repeated message ids and sums unique calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-dedupe-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(
    file,
    [
      JSON.stringify({ type: "mode", mode: "normal", sessionId: "s1" }),
      assistant("msg-1", usage(100, 10)),
      assistant("msg-1", usage(100, 10)), // duplicate id -> ignored
      assistant("msg-2", usage(50, 5)),
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
      assistant("a", usage(100, 10), { model: "deepseek-v4-pro" }),
      assistant("b", usage(40, 4), { model: "glm-5" }),
    ].join("\n") + "\n",
  );
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.deepEqual(result.models, [
    { name: "deepseek-v4-pro", input: 100, output: 10 },
    { name: "glm-5", input: 40, output: 4 },
  ]);
});

test("ZCode reader buckets per day and persists offsets across reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-daily-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(file, assistant("a", usage(100, 10), { timestamp: "2026-07-14T01:00:00.000Z" }) + "\n");
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const first = await reader.read(7);
  assert.deepEqual(first.tokenUsage.daily, [{ date: "2026-07-14", tokens: 110 }]);
  // Append a second-day record; the offset cache must avoid re-reading the first.
  await writeFile(file, `${await readFile(file, "utf8")}${assistant("b", usage(50, 5), { timestamp: "2026-07-15T02:00:00.000Z" })}\n`);
  const second = await reader.read(7);
  assert.equal(second.tokenUsage.lifetimeTotal, 165);
  assert.ok(second.tokenUsage.daily.some((d) => d.date === "2026-07-15" && d.tokens === 55));
});

test("ZCode reader ignores non-assistant lines and lines without usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-noise-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(
    file,
    [
      JSON.stringify({ type: "user", content: "hi" }),
      JSON.stringify({ type: "assistant", message: { id: "x", model: "m" } }), // no usage
      JSON.stringify({ type: "assistant", message: { id: "y", model: "m", usage: usage(0, 0) } }), // zero usage
      assistant("z", usage(20, 2)),
    ].join("\n") + "\n",
  );
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.lifetimeTotal, 22);
  assert.deepEqual(result.warnings, []);
});

test("ZCode reader counts id-less usage records independently", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-no-id-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  await writeFile(file, `${assistant("", usage(10, 2))}\n${assistant("", usage(10, 2))}\n`);
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
  await writeFile(file, `${assistant("cached", usage(100, 10, { cacheRead: 20, cacheCreate: 30 }))}\n`);
  const reader = new ZcodeSessionLogReader({ logRoot: root, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.input, 100);
  assert.equal(result.tokenUsage.cachedInput, 50);
  assert.equal(result.tokenUsage.output, 10);
  assert.equal(result.tokenUsage.lifetimeTotal, 160);
  assert.deepEqual(result.tokenUsage.daily, [{ date: "2026-07-15", tokens: 160 }]);
});

test("ZCode reader rebuilds a version-one cache after total semantics change", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-old-cache-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  const file = join(sessions, "session.jsonl");
  const line = `${assistant("fresh", usage(10, 2, { cacheRead: 5 }))}\n`;
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
  assert.equal(result.tokenUsage.lifetimeTotal, 17);
});
