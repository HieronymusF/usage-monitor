import React from "react";
/**
 * ZCodeHero + ZCodeSidePanel 渲染测试。
 *
 * 这两个是 ZCodeCard 的核心展示子组件，覆盖 visual-spec §5 ZCode 两行的内容契约。
 * 不测整张 ZCodeCard（CardHeader 依赖 @/stores，tsx loader 在 node:test 下不解析 paths，
 * 整卡集成测留给 CARD_PREVIEW 视觉验证）。这是 unit test 本意：测单元，不测胶水。
 *
 * 验证矩阵：
 * - ZCodeHero LocalData：今日 Token = formatToken(today)
 * - ZCodeHero NoData：今日 = `—`，StatusLabel "服务未提供"
 * - ZCodeSidePanel LocalData：本机累计 + 模型名
 * - ZCodeSidePanel NoData：仅"服务未提供"
 *
 * 红线守护（AGENTS.md + visual-spec §5）：
 * - ZCode 永远不显示配额百分比（DOM 不含 0% / 100% / "5 小时剩余" / "每周剩余"）
 *
 * 期望值来源（AGENT_LESSONS L5 / G4，不反推实现）：
 * - formatToken(700_000) = "700K"（format-token.ts threshold 1_000, K 0 位小数）
 * - formatToken(392_800_000) = "392.8M"（visual-spec §6 样本值）
 * - zcodeLocalData fixture models[0].name = "GLM-4.6V"（fixtures/snapshots.ts:312）
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

// 显式初始化 i18n，切到 zh-CN，断言用中文文案（最接近生产行为，不依赖 navigator.language）。
import "../../../renderer/src/i18n";
import i18n from "i18next";
import { ZCodeHero } from "../../../renderer/src/components/card/zcode/ZCodeHero";
import { ZCodeSidePanel } from "../../../renderer/src/components/card/zcode/ZCodeSidePanel";
import { toClientUsageViewModel } from "../../../renderer/src/domain/usage-view-model";
import { zcodeLocalData, zcodeNoData } from "../../../renderer/src/domain/fixtures/snapshots";

afterEach(cleanup);

const NOW = () => new Date("2026-07-18T08:01:00.000Z");

function zcodeLocalClient() {
  return toClientUsageViewModel(zcodeLocalData.clients.zcode!, NOW);
}
function zcodeNoDataClient() {
  return toClientUsageViewModel(zcodeNoData.clients.zcode!, NOW);
}

// ---------- ZCodeHero ----------

test("Hero LocalData: 今日 Token = 700K（formatToken 700_000）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  render(<ZCodeHero tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("700K").length > 0, "今日 Token hero 应显示 700K");
});

test("Hero LocalData: caption 显示'今日'（tray.today i18n key）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  render(<ZCodeHero tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("今日").length > 0);
});

test("Hero LocalData: StatusLabel 显示'服务未提供'（ZCode 永远 unavailable）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  render(<ZCodeHero tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("服务未提供").length > 0);
});

test("Hero NoData: 今日 Token 显示 —（today=null）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeNoDataClient();
  render(<ZCodeHero tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("—").length > 0, "今日 Token 应显示 — 占位");
});

test("Hero: 大数字应用 displayXL 字号 92px（Hero 视觉层级）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  const { container } = render(<ZCodeHero tokenUsage={client.tokenUsage} />);
  // MetricValue 内层 span 带 fontSize
  const heroSpan = Array.from(container.querySelectorAll("span")).find(
    (el) => el.textContent === "700K" && el.style.fontSize === "92px",
  );
  assert.ok(heroSpan, "Hero 数字应用 displayXL (92px) 字号");
});

// ---------- ZCodeSidePanel ----------

test("SidePanel LocalData: 本机累计 = 392.8M（visual-spec §6 样本值）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  render(<ZCodeSidePanel tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("392.8M").length > 0);
});

test("SidePanel LocalData: 模型名 GLM-4.6V 出现（fixtures snapshots.ts:312）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  render(<ZCodeSidePanel tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("GLM-4.6V").length > 0);
});

test("SidePanel LocalData: caption 显示'本机累计'和'模型'", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  render(<ZCodeSidePanel tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("本机累计").length > 0);
  assert.ok(screen.getAllByText("模型").length > 0);
});

test("SidePanel NoData: 显示'服务未提供'，不显示虚构模型名", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeNoDataClient();
  render(<ZCodeSidePanel tokenUsage={client.tokenUsage} />);
  assert.ok(screen.getAllByText("服务未提供").length > 0);
  assert.equal(screen.queryByText("GLM-4.6V"), null, "NoData 不应显示模型名");
  assert.equal(screen.queryByText("392.8M"), null, "NoData 不应显示本机累计");
});

test("SidePanel LocalData: 本机累计应用 displayS 字号 34px（次级主指标档）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  const { container } = render(<ZCodeSidePanel tokenUsage={client.tokenUsage} />);
  const lifetimeSpan = Array.from(container.querySelectorAll("span, div")).find(
    (el) => el.textContent === "392.8M" && (el as HTMLElement).style?.fontSize === "34px",
  ) as HTMLElement | undefined;
  assert.ok(lifetimeSpan, "本机累计应用 displayS (34px) 字号");
});

// ---------- 红线守护 ----------

test("红线: Hero 不渲染配额文本（无 5h/weekly label，无 % 单位文本节点）", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  const { container } = render(<ZCodeHero tokenUsage={client.tokenUsage} />);
  // visible text 不含配额相关 label
  assert.equal(screen.queryByText("5 小时剩余"), null, "不应有 5h 配额 label");
  assert.equal(screen.queryByText("每周剩余"), null, "不应有 weekly 配额 label");
  // % 作为独立文本节点（配额百分号）不应出现——border-radius:50% 在 style 里不算
  // 检查所有文本 span，不含以 % 结尾的纯数字（如 "42%"）
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^\d+(\.\d+)?%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "不应有 N% 形式的配额数字文本节点");
});

test("红线: SidePanel 不渲染配额文本", () => {
  i18n.changeLanguage("zh-CN");
  const client = zcodeLocalClient();
  const { container } = render(<ZCodeSidePanel tokenUsage={client.tokenUsage} />);
  assert.equal(screen.queryByText("5 小时剩余"), null);
  assert.equal(screen.queryByText("每周剩余"), null);
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^\d+(\.\d+)?%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "不应有 N% 形式的配额数字");
});
