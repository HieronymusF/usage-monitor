import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { AppServerClient, AppServerError, buildSpawnSpec } from "../dist/appServerClient.js";

function fakeProcess(handler) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 123;
  child.killCount = 0;
  child.kill = () => { child.killCount += 1; return true; };
  let buffer = "";
  child.stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line) handler(JSON.parse(line), child.stdout);
    }
  });
  return child;
}

const reply = (stdout, id, result, error) => stdout.write(`${JSON.stringify({ id, ...(error ? { error } : { result }) })}\n`);

test("account usage unknown method becomes capability=false", async () => {
  const process = fakeProcess((message, stdout) => {
    if (message.method === "initialize") reply(stdout, message.id, {});
    if (message.method === "account/rateLimits/read") reply(stdout, message.id, { rateLimits: { primary: { usedPercent: 1, windowDurationMins: 10080 } } });
    if (message.method === "account/usage/read") reply(stdout, message.id, undefined, { code: -32600, message: "unknown variant account/usage/read" });
  });
  const client = new AppServerClient({ spawnProcess: () => process, requestTimeoutMs: 100 });
  assert.equal((await client.readRateLimits()).rateLimits.primary.windowDurationMins, 10080);
  assert.equal(await client.readAccountUsage(), null);
  assert.equal(client.usageCapability, false);
  client.close();
});

test("timeout terminates child and next read restarts app-server", async () => {
  let spawns = 0;
  const processes = [];
  const client = new AppServerClient({
    requestTimeoutMs: 10,
    spawnProcess: () => {
      spawns += 1;
      const process = fakeProcess((message, stdout) => {
        if (message.method === "initialize") reply(stdout, message.id, {});
        if (message.method === "account/rateLimits/read" && spawns > 1) reply(stdout, message.id, { rateLimits: {} });
      });
      processes.push(process);
      return process;
    },
  });
  await assert.rejects(client.readRateLimits(), (error) => error.code === "APP_SERVER_TIMEOUT");
  assert.equal(processes[0].killCount, 1);
  await client.readRateLimits();
  assert.equal(spawns, 2);
  client.close();
});

test("missing command and cross-platform paths are handled", async () => {
  const client = new AppServerClient({ spawnProcess: () => { throw new Error("ENOENT"); } });
  await assert.rejects(client.start(), AppServerError);
  const windows = buildSpawnSpec("win32", "C:\\Program Files\\Codex CLI\\codex.cmd");
  assert.equal(windows.command, "powershell.exe");
  assert.equal(windows.env.CODEX_USAGE_EXECUTABLE, "C:\\Program Files\\Codex CLI\\codex.cmd");
  assert.deepEqual(buildSpawnSpec("darwin", "/Applications/Codex CLI/codex"), { command: "/Applications/Codex CLI/codex", args: ["app-server"] });
  assert.deepEqual(buildSpawnSpec("linux", "/opt/codex cli/codex"), { command: "/opt/codex cli/codex", args: ["app-server"] });
});

test("Windows executes a configured command whose path contains spaces", { skip: process.platform !== "win32" }, async () => {
  const previous = process.env.CODEX_PATH;
  process.env.CODEX_PATH = fileURLToPath(new URL("./fixtures/path%20with%20spaces/codex.cmd", import.meta.url));
  const client = new AppServerClient({ requestTimeoutMs: 2_000 });
  try {
    const result = await client.readRateLimits();
    assert.equal(result.rateLimits.primary.windowDurationMins, 10080);
  } finally {
    client.close();
    if (previous === undefined) delete process.env.CODEX_PATH;
    else process.env.CODEX_PATH = previous;
  }
});
