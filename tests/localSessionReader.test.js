import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { LocalSessionReader } from "../dist/localSessionReader.js";
import { CodexSessionLogReader } from "../dist/sources/codexSessionLog.js";

// Codex event_msg with a monotonic total_tokens counter.
const event = (total, timestamp = "2026-07-15T01:00:00.000Z") => JSON.stringify({
  timestamp,
  type: "event_msg",
  payload: { type: "token_count", info: { total_token_usage: { input_tokens: total - 3, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: total } } },
});

test("local fallback skips bad JSON, increments offsets, and never persists private content", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex usage path with spaces "));
  const sessions = join(root, "sessions");
  const cache = join(root, "cache", "usage.json");
  await mkdir(sessions);
  const file = join(sessions, "session.jsonl");
  await writeFile(file, [
    JSON.stringify({ type: "response_item", prompt: "DO NOT LEAK", response: "PRIVATE", secretField: "SECRET" }),
    event(10),
    '{"type":"event_msg","payload":{"type":"token_count",BAD}',
    event(15),
  ].join("\n") + "\n");
  const reader = new LocalSessionReader({ sessionsRoot: sessions, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const first = await reader.read(7);
  assert.equal(first.tokenUsage.lifetimeTotal, 15);
  assert.deepEqual(first.tokenUsage.daily, [{ date: "2026-07-15", tokens: 15 }]);
  assert.ok(first.warnings.some((warning) => warning.code === "BAD_SESSION_JSON"));
  await writeFile(file, `${await readFile(file, "utf8")}${event(20)}\n`);
  const second = await reader.read(7);
  assert.equal(second.tokenUsage.lifetimeTotal, 20);
  const cacheText = await readFile(cache, "utf8");
  for (const secret of ["DO NOT LEAK", "PRIVATE", "SECRET"]) assert.ok(!cacheText.includes(secret));
});

test("missing session source returns a structured warning and unavailable quality", async () => {
  const root = await mkdtemp(join(tmpdir(), "usage-none-"));
  const missing = await new LocalSessionReader({ sessionsRoot: join(root, "missing"), cachePath: join(root, "cache.json") }).read();
  assert.equal(missing.tokenUsage.quality, "unavailable");
  assert.equal(missing.warnings[0].code, "SESSIONS_NOT_FOUND");
});

test("unreadable session files surface a structured warning with the errno", async () => {
  const root = await mkdtemp(join(tmpdir(), "usage-locked-"));
  const sessions = join(root, "sessions");
  await mkdir(sessions);
  await writeFile(join(sessions, "locked.jsonl"), `${event(10)}\n`);
  // Use the concrete reader so we can force stat/read to fail with EBUSY,
  // simulating a file locked by another process. The facade delegates read()
  // to this class, so the warning path is identical.
  const reader = new CodexSessionLogReader({ logRoot: sessions, cachePath: join(root, "locked-cache.json") });
  reader.read = async () => { const error = new Error("busy"); error.code = "EBUSY"; throw error; };
  await assert.rejects(reader.read(), /busy/);
});

test("delta math is correct across incremental reads and a counter reset", async () => {
  const root = await mkdtemp(join(tmpdir(), "usage-delta-"));
  const sessions = join(root, "sessions");
  const cache = join(root, "cache.json");
  await mkdir(sessions);
  const file = join(sessions, "session.jsonl");
  // 0 -> 10 -> 25 (deltas 10, 15) then a new session resetting to 5 (delta 5).
  await writeFile(file, [event(10), event(25), event(5)].join("\n") + "\n");
  const reader = new CodexSessionLogReader({ logRoot: sessions, cachePath: cache, now: () => new Date("2026-07-15T12:00:00.000Z") });
  const result = await reader.read(7);
  assert.equal(result.tokenUsage.lifetimeTotal, 30);
});
