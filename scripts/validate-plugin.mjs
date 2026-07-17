import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8"));

const errors = [];
if (manifest.name !== "codex-usage-monitor") errors.push("manifest name must be codex-usage-monitor");
if (root.split(/[\\/]/).at(-1) !== manifest.name) errors.push("plugin folder must match manifest name");
for (const key of ["skills", "mcpServers", "apps", "hooks"]) {
  const value = manifest[key];
  if (value !== undefined) {
    if (typeof value !== "string" || !value.startsWith("./")) errors.push(`${key} must start with ./`);
    else await access(join(root, value)).catch(() => errors.push(`${key} target does not exist: ${value}`));
  }
}
const mcp = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"));
const mcpServer = mcp.mcpServers?.["codex-usage-monitor"];
if (!mcpServer) errors.push("missing codex-usage-monitor MCP server");
if (mcpServer?.cwd !== "./") errors.push("MCP cwd must be relative to plugin root as ./");
if (!mcpServer?.args?.every((arg) => typeof arg !== "string" || !arg.includes("/") || arg.startsWith("./"))) {
  errors.push("MCP path args must start with ./");
}
await access(join(root, "skills", "usage-monitor", "SKILL.md")).catch(() => errors.push("missing usage-monitor skill"));
await access(join(root, "dist", "index.js")).catch(() => errors.push("missing build output dist/index.js"));
await access(join(root, "dist", "companionBridge.js")).catch(() => errors.push("missing companion bridge build output"));
await access(join(root, "companion", "CodexUsageMonitor.ps1")).catch(() => errors.push("missing Windows companion window"));
await access(join(root, "start-floating-window.cmd")).catch(() => errors.push("missing floating-window launcher"));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Plugin validation passed: codex-usage-monitor");
