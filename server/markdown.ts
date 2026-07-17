import type { ClientSnapshot, MultiClientSnapshot, QuotaWindow, UsageSnapshot } from "./types.js";

const formatNumber = (value: number | null): string => (value === null ? "不可用" : new Intl.NumberFormat("zh-CN").format(value));

function status(window: QuotaWindow): string {
  if (window.remainingPercent === null) return "⚪ 不可用";
  if (window.remainingPercent >= 50) return "🟢 充足";
  if (window.remainingPercent >= 20) return "🟡 注意";
  return "🔴 紧张";
}

function countdown(resetsAt: string | null, now: Date): string {
  if (!resetsAt) return "未提供";
  const delta = Math.max(0, Date.parse(resetsAt) - now.getTime());
  const minutes = Math.floor(delta / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} 天 ${hours} 小时后`;
  if (hours > 0) return `${hours} 小时 ${mins} 分后`;
  return `${mins} 分后`;
}

function quotaLine(label: string, window: QuotaWindow | undefined, now: Date): string {
  if (!window) return `| ${label} | 服务未提供 | ⚪ 不可用 | — |`;
  const remaining = window.remainingPercent === null ? "不可用" : `${window.remainingPercent}%（由官方已用比例派生）`;
  return `| ${label} | ${remaining} | ${status(window)} | ${countdown(window.resetsAt, now)} |`;
}

function todayTokens(snapshot: { tokenUsage: { daily?: { date: string; tokens: number }[] | null } }, now: Date): number | null {
  return snapshot.tokenUsage.daily?.find((item) => item.date === now.toISOString().slice(0, 10))?.tokens ?? null;
}

/**
 * Render a single client's section. Codex shows its quota table; ZCode shows a
 * local-estimate token summary. Kept shared so both the multi-client card and
 * legacy single-snapshot helpers render identically.
 */
export function renderClientSection(client: ClientSnapshot, now = new Date()): string {
  const today = todayTokens(client, now);
  const lines: string[] = [];
  lines.push(`### ${client.displayName} 用量`);
  if (client.limits.length || client.clientId === "codex") {
    const fiveHour = client.limits.find((item) => item.windowMinutes === 300);
    const weekly = client.limits.find((item) => item.windowMinutes === 10_080);
    const other = client.limits.filter((item) => item.windowMinutes !== 300 && item.windowMinutes !== 10_080);
    lines.push("");
    lines.push("| 窗口 | 剩余 | 状态 | 重置倒计时 |");
    lines.push("|---|---:|---|---|");
    lines.push(quotaLine("5 小时", fiveHour, now));
    lines.push(quotaLine("每周", weekly, now));
    for (const item of other) lines.push(quotaLine(item.label, item, now));
  }
  lines.push("");
  lines.push(`Token：当前任务 ${formatNumber(client.tokenUsage.total)} · 今日 ${formatNumber(today)} · 累计 ${formatNumber(client.tokenUsage.lifetimeTotal)}`);
  if (client.models && client.models.length) {
    lines.push("", "按模型：");
    for (const model of client.models) lines.push(`- \`${model.name}\`：输入 ${formatNumber(model.input)} · 输出 ${formatNumber(model.output)}`);
  }
  lines.push("", `数据来源：${client.tokenUsage.source}（${client.tokenUsage.quality}）`);
  return lines.join("\n");
}

/** Render the aggregate multi-client card shown by get_all_usage. */
export function renderMultiClientCard(snapshot: MultiClientSnapshot, now = new Date()): string {
  const stale = now.getTime() > Date.parse(snapshot.staleAfter);
  const order = ["codex", "zcode"];
  const present = order.flatMap((id) => {
    const client = snapshot.clients[id];
    return client ? [client] : [];
  });
  const others = Object.values(snapshot.clients).filter((client) => !order.includes(client.clientId));
  const lines = [
    `## 多客户端用量${stale ? " · ⚠️ 数据可能已过期" : ""}`,
    "",
    `更新时间：${snapshot.fetchedAt} · 刷新入口：调用 \`refresh_all_usage\``,
  ];
  for (const client of [...present, ...others]) {
    lines.push("", renderClientSection(client, now));
  }
  if (snapshot.warnings.length) {
    lines.push("", `提示：${snapshot.warnings.map((warning) => `${warning.code}：${warning.message}`).join("；")}`);
  }
  return lines.join("\n");
}

/** Anything renderUsageCard can accept: legacy, multi-client, or single client. */
export type RenderableSnapshot = UsageSnapshot | MultiClientSnapshot | ClientSnapshot;

/**
 * Legacy single-snapshot renderer, kept for the Codex-only MCP tools and the
 * existing normalize/markdown tests. Dispatches to the multi-client or single
 * client renderers when given those shapes.
 */
export function renderUsageCard(snapshot: RenderableSnapshot, now = new Date()): string {
  if ("clients" in snapshot) return renderMultiClientCard(snapshot, now);
  if ("clientId" in snapshot) return renderClientSection(snapshot, now);
  const fiveHour = snapshot.limits.find((item) => item.windowMinutes === 300);
  const weekly = snapshot.limits.find((item) => item.windowMinutes === 10_080);
  const other = snapshot.limits.filter((item) => item.windowMinutes !== 300 && item.windowMinutes !== 10_080);
  const today = todayTokens(snapshot, now);
  const stale = now.getTime() > Date.parse(snapshot.staleAfter);
  const lines = [
    `## Codex 用量${stale ? " · ⚠️ 数据可能已过期" : ""}`,
    "",
    "| 窗口 | 剩余 | 状态 | 重置倒计时 |",
    "|---|---:|---|---|",
    quotaLine("5 小时", fiveHour, now),
    quotaLine("每周", weekly, now),
    ...other.map((item) => quotaLine(item.label, item, now)),
    "",
    `Token：当前任务 ${formatNumber(snapshot.tokenUsage.total)} · 今日 ${formatNumber(today)} · 累计 ${formatNumber(snapshot.tokenUsage.lifetimeTotal)}`,
    "",
    `数据来源：配额 app_server / Token ${snapshot.tokenUsage.source}（${snapshot.tokenUsage.quality}）`,
    `更新时间：${snapshot.fetchedAt} · 刷新入口：调用 \`refresh_codex_usage\``,
  ];
  if (snapshot.warnings.length) {
    lines.push("", `提示：${snapshot.warnings.map((warning) => `${warning.code}：${warning.message}`).join("；")}`);
  }
  return lines.join("\n");
}
