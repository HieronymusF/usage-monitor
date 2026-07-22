import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { MultiClientSnapshot } from "../server/types.js";

interface BridgeConnection {
  host: "127.0.0.1";
  port: number;
  bridgeKey: string;
}

export interface BridgeClientOptions {
  bridgeScript: string;
  executable?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConnection(line: string): BridgeConnection {
  const value: unknown = JSON.parse(line);
  if (
    !isRecord(value) ||
    value.host !== "127.0.0.1" ||
    !Number.isInteger(value.port) ||
    typeof value.port !== "number" ||
    value.port < 1 ||
    value.port > 65_535 ||
    typeof value.bridgeKey !== "string" ||
    value.bridgeKey.length < 16
  ) {
    throw new Error("Companion bridge returned an invalid connection descriptor");
  }
  return {
    host: value.host,
    port: value.port,
    bridgeKey: value.bridgeKey,
  };
}

function isSnapshot(value: unknown): value is MultiClientSnapshot {
  return (
    isRecord(value) &&
    value.schemaVersion === 2 &&
    typeof value.fetchedAt === "string" &&
    typeof value.staleAfter === "string" &&
    isRecord(value.clients) &&
    Array.isArray(value.warnings)
  );
}

export class CompanionBridgeClient {
  readonly #options: Required<Omit<BridgeClientOptions, "executable">> &
    Pick<BridgeClientOptions, "executable">;
  #child: ChildProcessWithoutNullStreams | null = null;
  #connection: BridgeConnection | null = null;

  constructor(options: BridgeClientOptions) {
    this.#options = {
      bridgeScript: options.bridgeScript,
      startupTimeoutMs: options.startupTimeoutMs ?? 10_000,
      requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
      ...(options.executable ? { executable: options.executable } : {}),
    };
  }

  async start(): Promise<void> {
    if (this.#connection && this.#child && !this.#child.killed) return;
    if (!existsSync(this.#options.bridgeScript)) {
      throw new Error("Companion bridge build output is missing");
    }

    const executable = this.#options.executable ?? process.execPath;
    const child = spawn(executable, [this.#options.bridgeScript, "--port", "0"], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child = child;
    child.stderr.resume();

    try {
      this.#connection = await this.#readConnection(child);
    } catch (error) {
      child.kill();
      this.#child = null;
      throw error;
    }

    child.once("exit", () => {
      if (this.#child === child) {
        this.#child = null;
        this.#connection = null;
      }
    });
  }

  getUsage(): Promise<MultiClientSnapshot> {
    return this.#request("/usage", "GET");
  }

  refreshUsage(): Promise<MultiClientSnapshot> {
    return this.#request("/refresh", "POST");
  }

  async close(): Promise<void> {
    const child = this.#child;
    if (!child) return;

    try {
      if (this.#connection) {
        await this.#request("/shutdown", "POST", false);
      }
    } catch {
      // The child may already be gone; the bounded exit wait below is authoritative.
    }

    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_500);
        timer.unref();
      }),
    ]);
    if (child.exitCode === null && !child.killed) child.kill();
    this.#child = null;
    this.#connection = null;
  }

  #readConnection(child: ChildProcessWithoutNullStreams): Promise<BridgeConnection> {
    return new Promise((resolve, reject) => {
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Companion bridge startup timed out"));
      }, this.#options.startupTimeoutMs);
      timeout.unref();

      const cleanup = (): void => {
        clearTimeout(timeout);
        lines.removeAllListeners();
        lines.close();
        child.removeListener("error", onError);
        child.removeListener("exit", onExit);
      };
      const onError = (): void => {
        cleanup();
        reject(new Error("Companion bridge process could not start"));
      };
      const onExit = (): void => {
        cleanup();
        reject(new Error("Companion bridge exited before it was ready"));
      };

      child.once("error", onError);
      child.once("exit", onExit);
      lines.once("line", (line) => {
        cleanup();
        try {
          resolve(parseConnection(line));
        } catch {
          reject(new Error("Companion bridge returned an invalid connection descriptor"));
        }
      });
    });
  }

  async #request(
    path: "/usage" | "/refresh" | "/shutdown",
    method: "GET" | "POST",
    expectSnapshot = true,
  ): Promise<MultiClientSnapshot> {
    const connection = this.#connection;
    if (!connection) throw new Error("Companion bridge is unavailable");

    const response = await fetch(`http://${connection.host}:${connection.port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${connection.bridgeKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(this.#options.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`Companion bridge request failed (${response.status})`);

    const body: unknown = await response.json();
    if (!expectSnapshot) return body as MultiClientSnapshot;
    if (!isSnapshot(body)) throw new Error("Companion bridge returned an invalid usage snapshot");
    return body;
  }
}
