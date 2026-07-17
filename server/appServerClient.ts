import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { RawRateLimitsResponse, ThreadTokenUsage } from "./types.js";
import { normalizeThreadTokenUsage } from "./normalize.js";

interface JsonRpcError {
  code: number;
  message: string;
}

interface JsonRpcMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

export interface SpawnSpec {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

function resolveWindowsCodex(configuredPath: string | undefined): string {
  if (configuredPath) return configuredPath;
  try {
    const matches = execFileSync("where.exe", ["codex"], { encoding: "utf8", windowsHide: true })
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    return matches.find((value) => /\.(cmd|exe)$/i.test(value)) ?? matches[0] ?? "codex";
  } catch {
    return "codex";
  }
}

export function buildSpawnSpec(
  platform = process.platform,
  configuredPath = process.env.CODEX_PATH,
): SpawnSpec {
  if (platform === "win32") {
    const executable = resolveWindowsCodex(configuredPath);
    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "& $env:CODEX_USAGE_EXECUTABLE app-server"],
      env: { CODEX_USAGE_EXECUTABLE: executable },
    };
  }
  return { command: configuredPath ?? "codex", args: ["app-server"] };
}

export class AppServerError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export interface AppServerClientOptions {
  requestTimeoutMs?: number;
  spawnProcess?: (spec: SpawnSpec) => ChildProcessWithoutNullStreams;
  now?: () => number;
}

export class AppServerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private startPromise: Promise<void> | null = null;
  private readonly pending = new Map<
    number,
    { method: string; startedAt: number; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private accountUsageSupported: boolean | null = null;
  private latestThreadUsage: ThreadTokenUsage | null = null;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly spawnProcess: (spec: SpawnSpec) => ChildProcessWithoutNullStreams;
  private readonly usesDefaultSpawn: boolean;

  constructor(options: AppServerClientOptions = {}) {
    super();
    this.timeoutMs = options.requestTimeoutMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.usesDefaultSpawn = options.spawnProcess === undefined;
    this.spawnProcess =
      options.spawnProcess ??
      ((spec) => spawn(spec.command, spec.args, { stdio: "pipe", windowsHide: true, env: { ...process.env, ...spec.env } }));
  }

  get usageCapability(): boolean | null {
    return this.accountUsageSupported;
  }

  get threadUsage(): ThreadTokenUsage | null {
    return this.latestThreadUsage;
  }

  async start(): Promise<void> {
    if (this.child) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startInternal(): Promise<void> {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnProcess(buildSpawnSpec());
    } catch (error) {
      throw new AppServerError(error instanceof Error ? error.message : "codex not found", "CODEX_NOT_FOUND");
    }
    this.child = child;
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.handleLine(line));
    child.once("error", (error) => this.handleExit(new AppServerError(error.message, "CODEX_NOT_FOUND")));
    child.once("exit", () => this.handleExit(new AppServerError("app-server exited", "APP_SERVER_EXITED")));
    await this.request("initialize", {
      clientInfo: { name: "codex-usage-monitor", title: "Codex Usage Monitor", version: "0.1.0" },
      capabilities: null,
    });
    this.notify("initialized", {});
  }

  async readRateLimits(): Promise<RawRateLimitsResponse> {
    await this.start();
    return (await this.request("account/rateLimits/read", {})) as RawRateLimitsResponse;
  }

  async readAccountUsage(): Promise<unknown | null> {
    await this.start();
    if (this.accountUsageSupported === false) return null;
    try {
      const result = await this.request("account/usage/read", {});
      this.accountUsageSupported = true;
      return result;
    } catch (error) {
      if (error instanceof AppServerError && error.code === "METHOD_NOT_SUPPORTED") {
        this.accountUsageSupported = false;
        return null;
      }
      throw error;
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.child) return Promise.reject(new AppServerError("app-server is not running", "APP_SERVER_EXITED"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AppServerError(`${method} timed out`, "APP_SERVER_TIMEOUT"));
        this.restart();
      }, this.timeoutMs);
      this.pending.set(id, { method, startedAt: this.now(), resolve, reject, timer });
      this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  private notify(method: string, params: unknown): void {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private handleLine(line: string): void {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      this.emit("warning", { code: "BAD_PROTOCOL_JSON", message: "app-server 返回了无法解析的 JSON 行。" });
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        const unsupported = message.error.code === -32601 || /unknown (method|variant)/i.test(message.error.message);
        pending.reject(
          new AppServerError(
            `${pending.method} failed (${message.error.code})`,
            unsupported ? "METHOD_NOT_SUPPORTED" : message.error.code === -32000 ? "AUTH_REQUIRED" : "APP_SERVER_ERROR",
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method === "account/rateLimits/updated") {
      const params = message.params as { rateLimits?: unknown } | undefined;
      this.emit("rateLimitsUpdated", params?.rateLimits ?? message.params);
    } else if (message.method === "thread/tokenUsage/updated") {
      const usage = normalizeThreadTokenUsage(message.params);
      if (usage) {
        this.latestThreadUsage = usage;
        this.emit("threadTokenUsageUpdated", usage);
      }
    }
  }

  private handleExit(error: Error): void {
    this.child = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.emit("disconnected", error);
  }

  private restart(): void {
    const child = this.child;
    this.child = null;
    if (child) this.terminateChild(child);
  }

  private terminateChild(child: ChildProcessWithoutNullStreams): void {
    child.stdin.end();
    if (this.usesDefaultSpawn && process.platform === "win32" && child.pid) {
      try {
        execFileSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
        return;
      } catch {
        // Fall through to the normal process kill if taskkill has already lost the race.
      }
    }
    child.kill();
  }

  close(): void {
    const child = this.child;
    this.child = null;
    if (child) this.terminateChild(child);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new AppServerError("client closed", "APP_SERVER_EXITED"));
    }
    this.pending.clear();
    this.removeAllListeners();
  }
}
