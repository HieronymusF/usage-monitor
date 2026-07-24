/**
 * ProbeDaemon 类级测试 — 代际防护/串行/重启（不依赖真实 powershell，注入 fake spawner）。
 *
 * integration test 测真实线协议；这里测 ProbeDaemon 类的并发逻辑：
 * - P1：timeout → kill child → restart → 旧 child 迟到 exit → 不影响新请求。
 * - 真串行：一次一个 inFlight。
 * - fg/hover 走 fake child 响应（可控时序）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ProbeDaemon, type ProbeChild } from "../../electron/windows/probe-daemon";

/**
 * fake child：可控 stdout/exit。
 * - stdin.write 收集请求（按行）。
 * - emitResponse(line) 模拟 daemon 写一行响应。
 * - emitExit() 模拟进程退出。
 */
function makeFakeChild(): ProbeChild & {
  requests: string[];
  dataListener: ((chunk: string) => void) | null;
  exitListeners: Array<() => void>;
  emitResponse(line: string): void;
  emitExit(): void;
} {
  const requests: string[] = [];
  let dataListener: ((chunk: string) => void) | null = null;
  const exitListeners: Array<() => void> = [];
  return {
    requests,
    dataListener: null,
    exitListeners,
    stdin: {
      write(data: string) {
        // 按行收集请求（去掉尾换行）。
        for (const line of data.split("\n")) {
          const t = line.trim();
          if (t.length > 0) requests.push(t);
        }
        return true;
      },
      end() {
        /* noop */
      },
    },
    stdout: {
      setEncoding() {
        /* noop */
      },
      on(event: "data", listener: (chunk: string) => void) {
        if (event === "data") dataListener = listener;
        return this;
      },
    },
    stderr: { resume() {} },
    once(event: "exit" | "error", listener: (...args: unknown[]) => void) {
      if (event === "exit") exitListeners.push(() => listener());
      return this;
    },
    kill() {
      return true;
    },
    killed: false,
    exitCode: null,
    emitResponse(line: string) {
      dataListener?.(line + "\n");
    },
    emitExit() {
      for (const l of exitListeners) l();
    },
  };
}

/** 创建 ProbeDaemon，注入 fake spawner。返回 daemon + 当前 fake child 的获取器。 */
function makeDaemonWithFakeChild(requestTimeoutMs = 2000): {
  daemon: ProbeDaemon;
  getChild: () => ReturnType<typeof makeFakeChild>;
  spawner: (exe: string, args: string[]) => ProbeChild;
} {
  let current = makeFakeChild();
  const spawner = () => {
    current = makeFakeChild();
    return current;
  };
  const daemon = new ProbeDaemon({
    scriptPath: "fake.ps1",
    spawner: spawner as unknown as (exe: string, args: string[]) => ProbeChild,
    requestTimeoutMs,
  });
  return { daemon, getChild: () => current, spawner };
}

/** 等待 fake child 收到请求（#start 有 ~200ms 启动延时，等请求写入 stdin）。 */
async function waitForRequest(child: ReturnType<typeof makeFakeChild>): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (child.requests.length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("fake child 未收到请求（超时）");
}

test("ProbeDaemon: fg 请求通过 fake child 响应（基本链路）", async () => {
  const { daemon, getChild } = makeDaemonWithFakeChild(5000);
  const p = daemon.getForegroundProcess();
  const child = getChild();
  await waitForRequest(child);
  const req = JSON.parse(child.requests[0] as string) as { id: number };
  child.emitResponse(JSON.stringify({ id: req.id, processName: "code" }));
  const result = await p;
  assert.deepEqual(result, { kind: "ok", processName: "code" });
  await daemon.dispose();
});

test("P1: timeout → kill → restart → 旧 child 迟到 exit → 新请求成功", async () => {
  // 请求 A 发出，但 fake child A 不响应 → 超时 → kill → 下次请求重启（child B）。
  // 然后 child A 迟到 exit → 不能 reject child B 的请求。
  // requestTimeout=400，但 #start 有 200ms 启动延时，请求在 200ms 后才写入，400ms 后超时。
  const { daemon, getChild } = makeDaemonWithFakeChild(400);
  const pA = daemon.getForegroundProcess();
  const childA = getChild();
  await waitForRequest(childA); // 等请求写入 childA
  // 不响应 → 超时 → getForegroundProcess 捕获返回 {kind:"error"}
  const resultA = await pA;
  assert.equal(resultA.kind, "error", "请求 A 超时降级为 error");

  // 请求 B：触发 restart（新 child B）。
  const pB = daemon.getForegroundProcess();
  const childB = getChild();
  await waitForRequest(childB);
  assert.notStrictEqual(childB, childA, "重启后是新 child");

  // child A 迟到 exit（被 kill 后的迟到事件）。
  childA.emitExit();
  await new Promise((r) => setTimeout(r, 10));

  // child B 正常响应请求 B。
  const reqB = JSON.parse(childB.requests[0] as string) as { id: number };
  childB.emitResponse(JSON.stringify({ id: reqB.id, processName: "codex" }));
  const resultB = await pB;
  assert.deepEqual(resultB, { kind: "ok", processName: "codex" }, "新请求成功（旧 exit 不影响）");
  await daemon.dispose();
});

test("P1: timeout → restart → 旧 child 迟到响应 → 不错配给新请求", async () => {
  // 请求 A 超时后，旧 child A 迟到吐响应（id=A）→ 新 child B 已在处理请求 B（id=B）。
  // A 的迟到响应必须被丢弃（id 不匹配 + 代次已变），不能错配给 B。
  const { daemon, getChild } = makeDaemonWithFakeChild(400);
  const pA = daemon.getForegroundProcess();
  const childA = getChild();
  await waitForRequest(childA);
  const reqA = JSON.parse(childA.requests[0] as string) as { id: number };
  const resultA = await pA;
  assert.equal(resultA.kind, "error", "请求 A 超时降级为 error");

  // 请求 B（重启 child B）。
  const pB = daemon.getForegroundProcess();
  const childB = getChild();
  await waitForRequest(childB);
  const reqB = JSON.parse(childB.requests[0] as string) as { id: number };

  // child A 迟到吐 A 的响应（旧代 + id 不匹配 childB 的 inFlight）。
  childA.emitResponse(JSON.stringify({ id: reqA.id, processName: "stale-from-A" }));
  await new Promise((r) => setTimeout(r, 10));
  // child B 吐 B 的响应。
  childB.emitResponse(JSON.stringify({ id: reqB.id, processName: "real-B" }));

  const resultB = await pB;
  assert.deepEqual(
    resultB,
    { kind: "ok", processName: "real-B" },
    "B 收到自己的响应，不被 A 的迟到响应错配",
  );
  await daemon.dispose();
});

test("ProbeDaemon: hover 请求走 fake child", async () => {
  const { daemon, getChild } = makeDaemonWithFakeChild(5000);
  const p = daemon.getHoverGeometry("12345");
  const child = getChild();
  await waitForRequest(child);
  const req = JSON.parse(child.requests[0] as string) as { id: number; hwnd: string };
  assert.equal(req.hwnd, "12345");
  child.emitResponse(
    JSON.stringify({
      id: req.id,
      cursorX: 10,
      cursorY: 20,
      windowLeft: 0,
      windowTop: 0,
      dpi: 96,
      primaryButtonPressed: true,
    }),
  );
  const geom = await p;
  assert.ok(geom !== null);
  assert.equal(geom?.cursorX, 10);
  assert.equal(geom?.primaryButtonPressed, true);
  await daemon.dispose();
});
