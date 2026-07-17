#!/usr/bin/env node
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { AppServerClient } from "./appServerClient.js";
import type { MultiClientSnapshot } from "./types.js";
import { MultiClientUsageService } from "./usageService.js";
import { CodexSource } from "./sources/codexSource.js";
import { CodexSessionLogReader } from "./sources/codexSessionLog.js";
import { ZcodeSource } from "./sources/zcodeSource.js";
import { ZcodeSessionLogReader } from "./sources/zcodeSessionLog.js";

export interface CompanionUsageService {
  getSnapshot(): Promise<MultiClientSnapshot>;
  refresh(force?: boolean): Promise<MultiClientSnapshot>;
  startPolling(): void;
  close(): void;
}

export interface CompanionBridgeOptions {
  host?: string;
  port?: number;
  bridgeKey?: string;
  service?: CompanionUsageService;
}

export interface RunningCompanionBridge {
  host: string;
  port: number;
  bridgeKey: string;
  close(): Promise<void>;
}

function authorized(request: IncomingMessage, bridgeKey: string): boolean {
  const actual = request.headers.authorization;
  const expected = `Bearer ${bridgeKey}`;
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function closeServer(server: Server, service: CompanionUsageService): Promise<void> {
  service.close();
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function createCompanionBridge(options: CompanionBridgeOptions = {}): Promise<RunningCompanionBridge> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1") throw new Error("Companion bridge only permits 127.0.0.1");
  const bridgeKey = options.bridgeKey ?? randomBytes(24).toString("base64url");
  const service = options.service ?? new MultiClientUsageService([new CodexSource(new AppServerClient(), new CodexSessionLogReader()), new ZcodeSource(new ZcodeSessionLogReader())]);
  let closing = false;
  let server: Server;

  server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        json(response, 200, { ok: true });
        return;
      }
      if (!authorized(request, bridgeKey)) {
        json(response, 401, { error: "unauthorized" });
        return;
      }
      if (request.method === "GET" && request.url === "/usage") {
        json(response, 200, await service.getSnapshot());
        return;
      }
      if (request.method === "POST" && request.url === "/refresh") {
        json(response, 200, await service.refresh(true));
        return;
      }
      if (request.method === "POST" && request.url === "/shutdown") {
        json(response, 200, { ok: true });
        if (!closing) {
          closing = true;
          setImmediate(() => void closeServer(server, service));
        }
        return;
      }
      json(response, 404, { error: "not_found" });
    } catch {
      json(response, 503, { error: "usage_unavailable" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Companion bridge did not expose a TCP port");
  service.startPolling();
  return {
    host,
    port: address.port,
    bridgeKey,
    close: async () => {
      if (closing) return;
      closing = true;
      await closeServer(server, service);
    },
  };
}

function readPort(): number {
  const index = process.argv.indexOf("--port");
  if (index < 0) return 0;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0 || value > 65_535) throw new Error("--port must be from 0 to 65535");
  return value;
}

async function main(): Promise<void> {
  const bridge = await createCompanionBridge({ port: readPort() });
  process.stdout.write(`${JSON.stringify({ host: bridge.host, port: bridge.port, bridgeKey: bridge.bridgeKey })}\n`);
  const shutdown = (): void => void bridge.close().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
