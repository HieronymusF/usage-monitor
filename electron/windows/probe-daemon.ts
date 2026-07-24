/**
 * ProbeDaemon — 长驻 PowerShell 守护进程客户端（D-3 性能 + 并发修复）。
 *
 * 启动一次 probe-daemon.ps1（spawn + Add-Type 只发生一次），后续每次探针只是一次
 * stdin/stdout 行往返（~1-5ms），满足 80ms hover / 300ms foreground 轮询。
 *
 * 线协议（probe-daemon.ps1）：每行一个 JSON 命令 → 一行 JSON 响应。命令带 requestId，
 * 响应原样回带 requestId，按 ID 匹配（不用 FIFO，避免超时错配）。
 *   请求：{"id":<n>,"cmd":"fg"}                          → 取前台窗口进程名
 *         {"id":<n>,"cmd":"hover","hwnd":<decimal>}       → 取光标+指定窗口几何
 *         {"id":<n>,"cmd":"quit"}                         → 退出
 *   响应：{"id":<n>,"processName":"code"} / {"id":<n>,"processName":null}   （fg）
 *         {"id":<n>,cursorX,..,dpi} / {"id":<n>,"error":".."}               （hover）
 *
 * 并发修复（P2-3，2026-07-23）：
 * - **真串行**：一次只允许一个在途请求（#inFlight）。发下一条前等当前 resolve/reject。
 *   这样不可能出现"超时请求的迟到响应错配给下一个请求"。
 * - 超时 → reject 当前请求 + kill 守护进程 + 下次请求 lazy restart（新 daemon 无残留响应）。
 * - 响应按 requestId 匹配（双保险：即使 daemon 乱序也只认自己的 id）。
 *
 * 稳定性：
 * - 单请求超时 2s。
 * - 守护进程意外退出 → reject 在途 + 下次请求自动重启（lazy restart）。
 *
 * 红线：只收发进程名 / 光标坐标 / 窗口几何 / DPI / 鼠标左键事件位。
 * 无 PID 路径/标题/凭据。
 */
import { spawn } from "node:child_process";
import type { ForegroundProbeResult } from "./foreground.js";
import type { ProbeGeometry } from "../../shared/hover-geometry.js";

/** Windows hover 协议在共享几何外附带的只读鼠标事件位。 */
export interface HoverProbeGeometry extends ProbeGeometry {
  /** 自上次探针以来发生过左键按下，或探针时左键仍按住。 */
  primaryButtonPressed: boolean;
}

/** 默认 spawn：包装 node:child_process.spawn 为 ProbeChild。 */
function defaultSpawn(executable: string, args: string[]): ProbeChild {
  return spawn(executable, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  }) as unknown as ProbeChild;
}

/** 单次请求超时（守护进程已启动，2s 足够且防卡死）。 */
const REQUEST_TIMEOUT_MS = 2_000;

/** 守护进程退出后强 kill 等待。 */
const DISPOSE_KILL_MS = 1_500;

export interface ProbeDaemonOptions {
  /** probe-daemon.ps1 绝对路径。 */
  scriptPath: string;
  /** 可覆盖的 powershell 可执行文件名（测试用）。默认 powershell.exe。 */
  executable?: string;
  /** 可覆盖的单请求超时（测试用）。 */
  requestTimeoutMs?: number;
  /**
   * 可覆盖的 spawn 函数（测试用 fake child）。默认 node:child_process.spawn。
   * 允许测试注入受控子进程（可控 stdout/exit 时序），验证代际防护/串行/重启。
   */
  spawner?: (executable: string, args: string[]) => ProbeChild;
}

/**
 * ProbeDaemon 使用的最小子进程接口（与 node:child_process.ChildProcess 的子集对齐）。
 * 抽象出来便于测试注入 fake。
 */
export interface ProbeChild {
  stdin: { write(data: string): boolean; end(): void };
  stdout: {
    setEncoding(encoding: string): void;
    on(event: "data", listener: (chunk: string) => void): unknown;
  };
  stderr: { resume(): void };
  once(event: "exit" | "error", listener: (...args: unknown[]) => void): unknown;
  kill(): boolean;
  killed: boolean;
  exitCode: number | null;
}

type PendingResolver = {
  id: number;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ProbeDaemon {
  readonly #scriptPath: string;
  readonly #executable: string;
  readonly #requestTimeoutMs: number;
  readonly #spawner: (executable: string, args: string[]) => ProbeChild;
  #child: ProbeChild | null = null;
  /**
   * P1 代际防护：每次 #start 自增。旧 child 被 kill 后，其迟到的 exit/error handler
   * 通过捕获的 generation 判断自己是否已过时——过时则不 reject 新 child 的在途请求。
   */
  #generation = 0;
  /** 启动中标记，避免并发 ensureStarted。 */
  #starting: Promise<void> | null = null;
  /** 真串行：一次只一个在途请求。 */
  #inFlight: PendingResolver | null = null;
  /** 单调递增请求 id。 */
  #nextId = 1;
  #buffer = "";
  #disposed = false;

  constructor(options: ProbeDaemonOptions) {
    this.#scriptPath = options.scriptPath;
    this.#executable = options.executable ?? "powershell.exe";
    this.#requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.#spawner = options.spawner ?? defaultSpawn;
  }

  /**
   * 取前台窗口进程名。返回可判别结果（P2-2）：
   * - { kind: "ok", processName } 成功检测（processName 可为 null = 无前台窗口）
   * - { kind: "error" } 探针执行失败（watcher 应保持当前 surface）
   */
  async getForegroundProcess(): Promise<ForegroundProbeResult> {
    try {
      await this.#ensureStarted();
      const line = await this.#request("fg");
      return parseProcessName(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[probe-daemon] fg failed: ${message}`);
      return { kind: "error" };
    }
  }

  /** 取光标 + 指定窗口几何。失败时降级 null。 */
  async getHoverGeometry(hwndDecimal: string): Promise<HoverProbeGeometry | null> {
    try {
      await this.#ensureStarted();
      const line = await this.#request("hover", { hwnd: hwndDecimal });
      return parseGeometry(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[probe-daemon] hover failed: ${message}`);
      return null;
    }
  }

  /** 优雅退出：发 quit 命令 + 等退出。shutdown 调用。 */
  async dispose(): Promise<void> {
    this.#disposed = true;
    const child = this.#child;
    if (!child) return;
    this.#rejectInFlight(new Error("probe-daemon disposed"));
    try {
      child.stdin.write(JSON.stringify({ id: this.#nextId++, cmd: "quit" }) + "\n");
    } catch {
      // stdin 已关，忽略。
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // 忽略。
        }
        resolve();
      }, DISPOSE_KILL_MS);
      timer.unref();
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.#child = null;
  }

  async #ensureStarted(): Promise<void> {
    if (this.#child && !this.#child.killed && this.#child.exitCode === null) return;
    if (this.#starting) return this.#starting;
    this.#starting = this.#start();
    try {
      await this.#starting;
    } finally {
      this.#starting = null;
    }
  }

  async #start(): Promise<void> {
    // P1 代际防护：本次启动的代次。handler 捕获它，过时则不 reject 新 child 的请求。
    const myGeneration = ++this.#generation;
    const child = this.#spawner(this.#executable, [
      "-NoProfile",
      "-NoLogo",
      "-NonInteractive",
      "-File",
      this.#scriptPath,
    ]);
    this.#child = child;
    this.#buffer = "";
    child.stderr.resume();
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      // 只处理当前代 child 的输出（旧 child 迟到输出忽略）。
      if (this.#generation !== myGeneration) return;
      this.#buffer += chunk;
      this.#drainLines();
    });
    child.once("exit", () => {
      // P1：旧 child 被 kill 后的迟到 exit 不能 reject 新 child 的在途请求。
      // 只有当前代的 child 退出才 reject（说明是意外退出，非主动 kill 重启）。
      if (this.#generation === myGeneration) {
        this.#rejectInFlight(new Error("probe-daemon exited unexpectedly"));
        if (this.#child === child) this.#child = null;
      }
    });
    child.once("error", (...args: unknown[]) => {
      // 同上：只有当前代 child 的 error 才 reject。
      if (this.#generation === myGeneration) {
        const err =
          args[0] instanceof Error ? args[0] : new Error(String(args[0] ?? "child error"));
        this.#rejectInFlight(err);
        if (this.#child === child) this.#child = null;
      }
    });

    // 启动确认：等进程 spawn 完成（短延时），真正失败由首次请求超时抓。
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 200);
      timer.unref();
    });
  }

  /**
   * 发一条命令，等对应响应。**真串行**：若已有在途请求，等它完成。
   * 超时 → reject + kill 守护进程（下次 lazy restart，避免迟到响应错配）。
   */
  #request(cmd: string, extra: Record<string, unknown> = {}): Promise<string> {
    if (this.#disposed) return Promise.reject(new Error("probe-daemon disposed"));
    const child = this.#child;
    if (!child) return Promise.reject(new Error("probe-daemon not started"));

    const doRequest = (): Promise<string> => {
      const currentChild = this.#child;
      if (this.#disposed || !currentChild) {
        return Promise.reject(new Error("probe-daemon not available"));
      }
      const id = this.#nextId++;
      return new Promise<string>((resolve, reject) => {
        const onTimeout = (): void => {
          // 超时：reject 当前 + kill 守护进程（重启后无残留响应，避免错配）。
          if (this.#inFlight?.id === id) this.#inFlight = null;
          this.#killChild();
          reject(new Error(`probe request timed out after ${this.#requestTimeoutMs}ms`));
        };
        const timer = setTimeout(onTimeout, this.#requestTimeoutMs);
        timer.unref();
        const pending: PendingResolver = {
          id,
          resolve: (line: string) => {
            clearTimeout(timer);
            if (this.#inFlight?.id === id) this.#inFlight = null;
            resolve(line);
          },
          reject: (error: Error) => {
            clearTimeout(timer);
            if (this.#inFlight?.id === id) this.#inFlight = null;
            reject(error);
          },
          timer,
        };
        this.#inFlight = pending;
        try {
          currentChild.stdin.write(JSON.stringify({ id, cmd, ...extra }) + "\n");
        } catch (error) {
          if (this.#inFlight?.id === id) this.#inFlight = null;
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    };

    // 真串行：若已有在途请求，先等它结束（resolve 或 reject）再发。
    const inflight = this.#inFlight;
    if (inflight) {
      return new Promise<string>((resolveQueue, rejectQueue) => {
        // 等当前在途的 promise 链结束。用轮询等待 inFlight 清空（简单可靠）。
        const wait = (): void => {
          if (!this.#inFlight) {
            doRequest().then(resolveQueue, rejectQueue);
          } else {
            setTimeout(wait, 5);
          }
        };
        wait();
      });
    }
    return doRequest();
  }

  #rejectInFlight(error: Error): void {
    const p = this.#inFlight;
    if (p) {
      this.#inFlight = null;
      clearTimeout(p.timer);
      p.reject(error);
    }
  }

  #killChild(): void {
    const child = this.#child;
    if (!child) return;
    try {
      child.kill();
    } catch {
      // 忽略。
    }
    if (this.#child === child) this.#child = null;
  }

  #drainLines(): void {
    let nl: number;
    while ((nl = this.#buffer.indexOf("\n")) >= 0) {
      const line = this.#buffer.slice(0, nl).replace(/\r$/, "").trim();
      this.#buffer = this.#buffer.slice(nl + 1);
      if (line.length === 0) continue;
      this.#dispatchLine(line);
    }
  }

  /**
   * 按 requestId 匹配响应（双保险：超时/乱序也不会错配）。
   * 无在途或 id 不匹配 → 丢弃（迟到响应）。
   */
  #dispatchLine(line: string): void {
    const inflight = this.#inFlight;
    if (!inflight) return; // 无在途请求，丢弃（迟到响应或 daemon 自发输出）。
    let parsedId: unknown;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        parsedId = (value as { id?: unknown }).id;
      }
    } catch {
      // 非 JSON：可能是 daemon 的杂项输出，忽略。
      return;
    }
    if (parsedId === inflight.id) {
      inflight.resolve(line);
    }
    // id 不匹配 → 丢弃（不属于当前在途请求）。
  }
}

/** 解析 fg 响应为可判别结果。导出供测试。 */
export function parseProcessName(line: string): ForegroundProbeResult {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { kind: "error" };
    }
    if ((value as { error?: unknown }).error !== undefined) {
      return { kind: "error" };
    }
    const name = (value as { processName?: unknown }).processName;
    if (name === null) return { kind: "ok", processName: null };
    if (typeof name === "string" && name.length > 0) return { kind: "ok", processName: name };
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** 解析 hover 响应。非法/error/null → null（降级）。导出供测试。 */
export function parseGeometry(line: string): HoverProbeGeometry | null {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (typeof v.error === "string") return null;
    const fields: Array<keyof ProbeGeometry> = [
      "cursorX",
      "cursorY",
      "windowLeft",
      "windowTop",
      "dpi",
    ];
    for (const f of fields) {
      if (typeof v[f] !== "number") return null;
    }
    if (typeof v.primaryButtonPressed !== "boolean") return null;
    return {
      cursorX: v.cursorX as number,
      cursorY: v.cursorY as number,
      windowLeft: v.windowLeft as number,
      windowTop: v.windowTop as number,
      dpi: v.dpi as number,
      primaryButtonPressed: v.primaryButtonPressed,
    };
  } catch {
    return null;
  }
}

export { REQUEST_TIMEOUT_MS };
