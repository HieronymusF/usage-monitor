#!/usr/bin/env node
import { createInterface } from "node:readline";
import { AppServerClient } from "./appServerClient.js";
import { renderMultiClientCard, renderUsageCard } from "./markdown.js";
import { MultiClientUsageService } from "./usageService.js";
import { CodexSource } from "./sources/codexSource.js";
import { CodexSessionLogReader } from "./sources/codexSessionLog.js";
import { ZcodeSource } from "./sources/zcodeSource.js";
import { ZcodeSessionLogReader } from "./sources/zcodeSessionLog.js";

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

// Construct the multi-client service. Sources are independent: a failing one
// degrades itself and never blocks the other.
const codexSource = new CodexSource(new AppServerClient(), new CodexSessionLogReader());
const zcodeSource = new ZcodeSource(new ZcodeSessionLogReader());
const service = new MultiClientUsageService([codexSource, zcodeSource]);

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const integerDays = (args: Record<string, unknown> | undefined): number => {
  const days = args?.days;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("days must be an integer from 1 to 90");
  }
  return days;
};

const tools = [
  {
    name: "get_codex_usage",
    title: "Get Codex usage",
    description: "Read the current Codex quota and token usage snapshot.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations,
  },
  {
    name: "refresh_codex_usage",
    title: "Refresh Codex usage",
    description: "Force a read-only Codex refresh. Requests started within five seconds are coalesced.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations,
  },
  {
    name: "get_codex_usage_history",
    title: "Get Codex usage history",
    description: "Read 1–90 days of Codex account history or clearly labeled local estimates.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 90 } },
      required: ["days"],
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: "get_zcode_usage",
    title: "Get ZCode usage",
    description: "Read ZCode token usage from local session logs (local estimate; ZCode exposes no official quota).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations,
  },
  {
    name: "refresh_zcode_usage",
    title: "Refresh ZCode usage",
    description: "Force a read-only ZCode refresh from local session logs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations,
  },
  {
    name: "get_zcode_usage_history",
    title: "Get ZCode usage history",
    description: "Read 1–90 days of ZCode token history from local session logs (local estimate only).",
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 90 } },
      required: ["days"],
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: "get_all_usage",
    title: "Get all clients usage",
    description: "Read the aggregate Codex + ZCode usage snapshot across all detected clients.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations,
  },
  {
    name: "refresh_all_usage",
    title: "Refresh all clients usage",
    description: "Force a read-only refresh of every detected client.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations,
  },
];

const send = (message: unknown): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

async function callTool(name: unknown, args: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  if (name === "get_codex_usage") {
    const snapshot = await service.getSnapshot();
    const codex = snapshot.clients.codex;
    if (!codex) throw new Error("Codex client is not registered");
    return { content: [{ type: "text", text: renderUsageCard(codex) }], structuredContent: codex };
  }
  if (name === "refresh_codex_usage") {
    const snapshot = await service.refresh(true);
    const codex = snapshot.clients.codex;
    if (!codex) throw new Error("Codex client is not registered");
    return { content: [{ type: "text", text: renderUsageCard(codex) }], structuredContent: codex };
  }
  if (name === "get_codex_usage_history") {
    const history = await service.getHistory("codex", integerDays(args));
    return {
      content: [{ type: "text", text: `## Codex Token 历史（${history.days} 天）\n\n来源：${history.source}（${history.quality}）\n\n\`\`\`json\n${JSON.stringify(history.daily, null, 2)}\n\`\`\`` }],
      structuredContent: history,
    };
  }
  if (name === "get_zcode_usage") {
    const snapshot = await service.getSnapshot();
    const zcode = snapshot.clients.zcode;
    if (!zcode) throw new Error("ZCode client is not registered");
    return { content: [{ type: "text", text: renderUsageCard(zcode) }], structuredContent: zcode };
  }
  if (name === "refresh_zcode_usage") {
    await zcodeSource.refresh();
    const snapshot = await service.getSnapshot();
    const zcode = snapshot.clients.zcode;
    if (!zcode) throw new Error("ZCode client is not registered");
    return { content: [{ type: "text", text: renderUsageCard(zcode) }], structuredContent: zcode };
  }
  if (name === "get_zcode_usage_history") {
    const history = await service.getHistory("zcode", integerDays(args));
    return {
      content: [{ type: "text", text: `## ZCode Token 历史（${history.days} 天）\n\n来源：${history.source}（${history.quality}）\n\n\`\`\`json\n${JSON.stringify(history.daily, null, 2)}\n\`\`\`` }],
      structuredContent: history,
    };
  }
  if (name === "get_all_usage") {
    const snapshot = await service.getSnapshot();
    return { content: [{ type: "text", text: renderMultiClientCard(snapshot) }], structuredContent: snapshot };
  }
  if (name === "refresh_all_usage") {
    const snapshot = await service.refresh(true);
    return { content: [{ type: "text", text: renderMultiClientCard(snapshot) }], structuredContent: snapshot };
  }
  throw new Error(`Unknown tool: ${String(name)}`);
}

async function handle(request: RpcRequest): Promise<void> {
  if (request.id === undefined) return;
  try {
    if (request.method === "initialize") {
      const requestedVersion = request.params?.protocolVersion;
      send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: typeof requestedVersion === "string" ? requestedVersion : "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "codex-usage-monitor", version: "0.2.0" } } });
      return;
    }
    if (request.method === "ping") {
      send({ jsonrpc: "2.0", id: request.id, result: {} });
      return;
    }
    if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
      return;
    }
    if (request.method === "tools/call") {
      const result = await callTool(request.params?.name, request.params?.arguments as Record<string, unknown> | undefined);
      send({ jsonrpc: "2.0", id: request.id, result });
      return;
    }
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32602, message: error instanceof Error ? error.message : "Invalid request" },
    });
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  try {
    void handle(JSON.parse(line) as RpcRequest);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
});

let shuttingDown = false;
const shutdown = (): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  service.close();
};
input.once("close", shutdown);
process.once("SIGINT", () => { shutdown(); process.exit(0); });
process.once("SIGTERM", () => { shutdown(); process.exit(0); });
process.once("exit", () => service.close());
service.startPolling();
