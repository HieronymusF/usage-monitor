import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { CodexSessionLogReader } from "../dist/sources/codexSessionLog.js";
import { ZcodeSessionLogReader } from "../dist/sources/zcodeSessionLog.js";

// 复现场景（HANDOFF 复验 2026-07-18）：
// 在 Asia/Hong_Kong (UTC+8) 的 2026-07-18T00:15:00+08:00，
// server 的 bucket key 必须是 "2026-07-18"（本地自然日），
// 与 renderer todayKey({timeZone:"Asia/Hong_Kong"}) 一致。

const codexEvent = (totalTokens, timestamp) =>
  JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: totalTokens - 2,
          cached_input_tokens: 0,
          output_tokens: 2,
          total_tokens: totalTokens,
        },
      },
    },
  });

const zcodeAssistant = (id, input, output, timestamp) =>
  JSON.stringify({
    type: "assistant",
    timestamp,
    message: { id, model: "m", role: "assistant", usage: { input_tokens: input, output_tokens: output } },
  });

test("Codex bucket key 在 UTC+8 凌晨分到本地当日（不是 UTC 昨天）", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-tz-"));
  const sessions = join(root, "sessions");
  const cache = join(root, "cache.json");
  await mkdir(sessions);
  // record 时间戳 = 2026-07-18T00:15:00+08:00 = 2026-07-17T16:15:00Z
  // UTC 切片会得到 "2026-07-17"，但本地是 "2026-07-18"
  await writeFile(
    join(sessions, "s.jsonl"),
    `${codexEvent(10, "2026-07-17T16:15:00.000Z")}\n`,
  );
  const reader = new CodexSessionLogReader({
    logRoot: sessions,
    cachePath: cache,
    timeZone: "Asia/Hong_Kong",
  });
  const result = await reader.read(7);
  assert.deepEqual(result.tokenUsage.daily, [{ date: "2026-07-18", tokens: 10 }]);
});

test("ZCode bucket key 在 UTC+8 凌晨分到本地当日（不是 UTC 昨天）", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-tz-"));
  const sessions = join(root, "projects", "D--");
  await mkdir(sessions, { recursive: true });
  const cache = join(root, "cache.json");
  // 同一时刻，ZCode 消息也应分到本地当日
  await writeFile(
    join(sessions, "s.jsonl"),
    `${zcodeAssistant("a", 100, 10, "2026-07-17T16:15:00.000Z")}\n`,
  );
  const reader = new ZcodeSessionLogReader({
    logRoot: root,
    cachePath: cache,
    timeZone: "Asia/Hong_Kong",
  });
  const result = await reader.read(7);
  assert.deepEqual(result.tokenUsage.daily, [{ date: "2026-07-18", tokens: 110 }]);
});

test("同一 UTC 时刻在 UTC 时区分桶为 UTC 当日（对照）", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-utc-"));
  const sessions = join(root, "sessions");
  const cache = join(root, "cache.json");
  await mkdir(sessions);
  await writeFile(
    join(sessions, "s.jsonl"),
    `${codexEvent(10, "2026-07-17T16:15:00.000Z")}\n`,
  );
  const reader = new CodexSessionLogReader({
    logRoot: sessions,
    cachePath: cache,
    timeZone: "UTC", // 明确 UTC 时区
  });
  const result = await reader.read(7);
  // UTC 时区下 16:15 仍是 07-17
  assert.deepEqual(result.tokenUsage.daily, [{ date: "2026-07-17", tokens: 10 }]);
});

test("server 与 renderer 今日契约对齐：bucket key = todayKey(timeZone)", async () => {
  // 这是契约统一的核心验证：server 写入的 bucket key 与 renderer 查询的 todayKey
  // 必须是同一个字符串，否则"今日 token"会查不到。
  const { todayKey } = await import("../dist/time.js");
  const root = await mkdtemp(join(tmpdir(), "codex-align-"));
  const sessions = join(root, "sessions");
  const cache = join(root, "cache.json");
  await mkdir(sessions);
  const now = () => new Date("2026-07-18T00:15:00.000+08:00"); // = 2026-07-17T16:15Z
  // 用与 now 同一时刻的 record 时间戳
  await writeFile(
    join(sessions, "s.jsonl"),
    `${codexEvent(10, "2026-07-17T16:15:00.000Z")}\n`,
  );
  const reader = new CodexSessionLogReader({
    logRoot: sessions,
    cachePath: cache,
    now,
    timeZone: "Asia/Hong_Kong",
  });
  const result = await reader.read(7);
  const bucketDate = result.tokenUsage.daily[0].date;
  const rendererToday = todayKey({ now, timeZone: "Asia/Hong_Kong" });
  assert.equal(
    bucketDate,
    rendererToday,
    `server bucket (${bucketDate}) 必须等于 renderer today (${rendererToday})`,
  );
  assert.equal(bucketDate, "2026-07-18");
});
