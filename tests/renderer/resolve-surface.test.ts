/**
 * resolveSurfaceFromProcessName 测试 — 自动模式（D-3 切片 1）的前台进程名 → surface 解析。
 *
 * 校验 shared/desktop.ts 的 resolveSurfaceFromProcessName：
 * - Codex / ChatGPT 桌面端 → card
 * - VS Code / Cursor / Windsurf / ZCode → indicator-bar
 * - 其他（含 null / 空串 / 未知名）→ orb
 * - powershell / pwsh → "unchanged"（切到 shell 时不跳 surface）
 *
 * 纯函数，无 Windows API，CI 安全。覆盖五类输入（AGENTS.md 代码纪律 6）。
 * 规则与 WPF companion/CodexUsageMonitor.ps1 Update-AutoMode 对齐。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveSurfaceFromProcessName } from "../../shared/desktop";

test("resolveSurface: codex/chatgpt → card", () => {
  assert.equal(resolveSurfaceFromProcessName("codex"), "card");
  assert.equal(resolveSurfaceFromProcessName("chatgpt"), "card");
});

test("resolveSurface: IDE 进程 → indicator-bar", () => {
  assert.equal(resolveSurfaceFromProcessName("code"), "indicator-bar");
  assert.equal(resolveSurfaceFromProcessName("cursor"), "indicator-bar");
  assert.equal(resolveSurfaceFromProcessName("windsurf"), "indicator-bar");
  assert.equal(resolveSurfaceFromProcessName("zcode"), "indicator-bar");
});

test("resolveSurface: 大小写不敏感（与 WPF ToLowerInvariant 对齐）", () => {
  assert.equal(resolveSurfaceFromProcessName("CODE"), "indicator-bar");
  assert.equal(resolveSurfaceFromProcessName("Cursor"), "indicator-bar");
  assert.equal(resolveSurfaceFromProcessName("CHATGPT"), "card");
  assert.equal(resolveSurfaceFromProcessName("Codex"), "card");
});

test("resolveSurface: powershell/pwsh → unchanged（切到 shell 不跳 surface）", () => {
  assert.equal(resolveSurfaceFromProcessName("powershell"), "unchanged");
  assert.equal(resolveSurfaceFromProcessName("pwsh"), "unchanged");
  assert.equal(resolveSurfaceFromProcessName("POWERSHELL"), "unchanged");
});

test("resolveSurface: 未知名/其他进程 → orb", () => {
  assert.equal(resolveSurfaceFromProcessName("explorer"), "orb");
  assert.equal(resolveSurfaceFromProcessName("chrome"), "orb");
  assert.equal(resolveSurfaceFromProcessName("notepad"), "orb");
  assert.equal(resolveSurfaceFromProcessName("codex-insider"), "orb", "不是子串匹配");
});

test("resolveSurface: null / 空串（无前台窗口或检测失败）→ orb", () => {
  assert.equal(resolveSurfaceFromProcessName(null), "orb");
  assert.equal(resolveSurfaceFromProcessName(""), "orb");
});
