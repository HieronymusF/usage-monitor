/**
 * ProbeDaemon 进程级集成测试 — 真实线协议（P0/P1 修复验证）。
 *
 * 与 probe-daemon-parse.test.ts 不同：这里 spawn 真实 powershell.exe + probe-daemon.ps1，
 * 验证端到端协议（不只 parse）。仅 win32 运行（其他平台跳过）。
 *
 * 覆盖：
 * - P0：每种响应（fg/hover/unknown/异常）都携带并保持请求 id。
 * - 连续 fg/hover 请求无超时、无串线。
 * - foreground error 不伪装成 null（Get-Process 异常路径，靠 ps1 内部逻辑保证，这里测 fg 正常路径）。
 *
 * 注：ProbeDaemon 类本身（真串行/超时重启/代际防护）需要长生命周期 + 超时控制，
 * 用底层 spawn 直接验证协议契约更直接。ProbeDaemon 类的代际/串行逻辑靠代码审查 + 真机。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const IS_WIN = process.platform === "win32";
const SCRIPT_PATH = resolve(import.meta.dirname, "../../electron/probe-daemon.ps1");

/** spawn 真实 daemon，发一组命令，收集响应行。返回 [responseLines]。 */
function runDaemon(commands: string[]): Promise<string[]> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-File", SCRIPT_PATH],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const lines: string[] = [];
    let buffer = "";
    let resolvedCount = 0;
    // 期望响应数 = 非 quit 命令数（quit 不响应）。
    const expected = commands.filter((c) => JSON.parse(c).cmd !== "quit").length;
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "").trim();
        buffer = buffer.slice(nl + 1);
        if (line.length > 0) {
          lines.push(line);
          resolvedCount += 1;
          if (resolvedCount >= expected) {
            try {
              child.stdin.end();
            } catch {
              // 忽略。
            }
          }
        }
      }
    });
    child.stderr.resume();
    child.on("error", rejectP);
    child.on("exit", () => {
      if (lines.length < expected) {
        rejectP(new Error(`daemon exited with only ${lines.length}/${expected} responses`));
      } else {
        resolveP(lines);
      }
    });
    // 写入所有命令。
    for (const cmd of commands) {
      child.stdin.write(cmd + "\n");
    }
  });
}

/** 取当前前台窗口 HWND（用于 hover 测试）。 */
function getForegroundHwnd(): Promise<string> {
  return new Promise((resolveP) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NoLogo",
        "-NonInteractive",
        "-Command",
        "(Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow();' -Name F -PassThru)::GetForegroundWindow().ToInt64()",
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (c: string) => (out += c));
    child.on("exit", () => resolveP(out.trim()));
  });
}

// 仅 win32 运行（mac/linux 无 powershell.exe / user32）。
const maybe = IS_WIN ? test : test.skip;

maybe("P0: fg 响应携带请求 id", async () => {
  assert.ok(existsSync(SCRIPT_PATH), "probe-daemon.ps1 存在");
  const responses = await runDaemon(['{"id":101,"cmd":"fg"}', '{"id":999,"cmd":"quit"}']);
  assert.equal(responses.length, 1, "一条 fg 响应");
  const parsed = JSON.parse(responses[0] as string) as { id?: number; processName?: string | null };
  assert.equal(parsed.id, 101, "fg 响应回传 id=101");
  // processName 可能是字符串或 null（无前台窗口），但字段必须存在。
  assert.ok("processName" in parsed, "fg 响应含 processName 字段");
});

maybe("P0: 连续 fg 请求各自回传正确 id（无串线）", async () => {
  const responses = await runDaemon([
    '{"id":1,"cmd":"fg"}',
    '{"id":2,"cmd":"fg"}',
    '{"id":3,"cmd":"fg"}',
    '{"id":999,"cmd":"quit"}',
  ]);
  assert.equal(responses.length, 3, "3 条 fg 响应");
  const ids = responses.map((r) => (JSON.parse(r as string) as { id: number }).id);
  assert.deepEqual(ids, [1, 2, 3], "id 顺序保持 1,2,3（无串线）");
});

maybe("P0: unknown-cmd 响应携带请求 id", async () => {
  const responses = await runDaemon(['{"id":777,"cmd":"bogus"}', '{"id":999,"cmd":"quit"}']);
  assert.equal(responses.length, 1);
  const parsed = JSON.parse(responses[0] as string) as { id?: number; error?: string };
  assert.equal(parsed.id, 777, "unknown-cmd 响应回传 id=777");
  assert.equal(typeof parsed.error, "string", "含 error 字段");
});

maybe("P0: hover 响应携带请求 id（有效 HWND）", async () => {
  const hwnd = await getForegroundHwnd();
  assert.ok(hwnd && hwnd !== "0", "有前台窗口");
  const responses = await runDaemon([
    `{"id":201,"cmd":"hover","hwnd":${hwnd}}`,
    '{"id":999,"cmd":"quit"}',
  ]);
  assert.equal(responses.length, 1);
  const parsed = JSON.parse(responses[0] as string) as {
    id?: number;
    cursorX?: number;
    dpi?: number;
  };
  assert.equal(parsed.id, 201, "hover 响应回传 id=201");
  assert.equal(typeof parsed.cursorX, "number", "含 cursorX");
  assert.equal(typeof parsed.dpi, "number", "含 dpi");
});

maybe("P0: hover 无效 HWND 返回带 id 的 error", async () => {
  const responses = await runDaemon([
    '{"id":202,"cmd":"hover","hwnd":99999999999}',
    '{"id":999,"cmd":"quit"}',
  ]);
  assert.equal(responses.length, 1);
  const parsed = JSON.parse(responses[0] as string) as { id?: number; error?: string };
  assert.equal(parsed.id, 202, "hover 错误响应回传 id=202");
  assert.equal(typeof parsed.error, "string", "含 error 字段");
});

maybe("P0: 连续 fg+hover+unknown 混合无串线", async () => {
  const hwnd = await getForegroundHwnd();
  const responses = await runDaemon([
    '{"id":10,"cmd":"fg"}',
    `{"id":20,"cmd":"hover","hwnd":${hwnd}}`,
    '{"id":30,"cmd":"fg"}',
    '{"id":40,"cmd":"bogus"}',
    '{"id":999,"cmd":"quit"}',
  ]);
  assert.equal(responses.length, 4, "4 条响应");
  const ids = responses.map((r) => (JSON.parse(r as string) as { id: number }).id);
  assert.deepEqual(ids, [10, 20, 30, 40], "混合请求 id 顺序保持，无串线");
});

maybe("性能：daemon 稳态单探针足够快（串行往返，启动开销另算）", async () => {
  // 串行：发一条等响应再发下一条（与 ProbeDaemon 真串行一致），测后 4 个往返延迟。
  // 第一个含冷启动（Add-Type 已在启动时完成，但仍可能有 JIT），跳过。
  return new Promise<void>((resolveP, rejectP) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-File", SCRIPT_PATH],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const timings: number[] = [];
    let buffer = "";
    let sentCount = 0;
    let sendTime = 0;
    const TOTAL = 5;

    const sendNext = (): void => {
      if (sentCount >= TOTAL) {
        try {
          child.stdin.write('{"id":999,"cmd":"quit"}\n');
        } catch {
          // 忽略。
        }
        return;
      }
      sendTime = Date.now();
      sentCount += 1;
      try {
        child.stdin.write(`{"id":${sentCount},"cmd":"fg"}\n`);
      } catch {
        // 忽略。
      }
    };

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length === 0) continue;
        timings.push(Date.now() - sendTime);
        sendNext();
      }
    });
    child.stderr.resume();
    child.on("error", rejectP);
    child.on("exit", () => {
      const steady = timings.slice(1); // 跳过冷启动
      if (steady.length < 4) {
        rejectP(new Error(`只收到 ${steady.length} 个稳态响应`));
        return;
      }
      const maxSteady = Math.max(...steady);
      // daemon 稳态串行往返应 < 80ms（Get-Process ~8-15ms + IPC 开销）。
      // 满足 hover 80ms / foreground 300ms 轮询（串行不堆积）。
      assert.ok(maxSteady < 80, `稳态串行探针 < 80ms（实测最大 ${maxSteady}ms）`);
      resolveP();
    });
    sendNext();
  });
});
