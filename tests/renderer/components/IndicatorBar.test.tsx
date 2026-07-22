import React from "react";
/**
 * IndicatorBar 测试（Milestone D §10.10）。
 *
 * 覆盖 visual-spec §6：
 * - Codex 4 段：Codex | 5H 42% | 周 64% ● | 今日 1.7M | 倒计时
 * - ZCode 4 段：ZCode | 今日 700K | 累计 392.8M | 模型 GLM-4.6V | 本机估算
 * - 2 个 30×30 IconButton（theme + close）
 *
 * 红线（AGENTS.md + visual-spec §6）：
 * - Codex NoQuota：5H 显示 —，周不显示百分比
 * - ZCode DOM 不含 N% / 0% / 100%
 *
 * 测 IndicatorBarInner（不测 wrapper IndicatorBar，它调 useUsageData → window.monitor，
 * 在 jsdom 下需要 mock。Inner 接受 vm prop，绕开 hook 链）。
 *
 * 期望值来源（AGENT_LESSONS L5/G4，不反推实现）：
 * - formatToken(1_650_000) = "1.7M"（dual fixture today）
 * - formatToken(700_000) = "700K"（zcodeLocalData today）
 * - formatToken(392_800_000) = "392.8M"（visual-spec §6 样本值）
 * - dual fixture primary 5h remaining=42，secondary weekly remaining=64
 * - GLM-4.6V（fixtures/snapshots.ts:312）
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import "../../../renderer/src/i18n";
import i18n from "i18next";
import { IndicatorBarInner } from "../../../renderer/src/components/bar/IndicatorBar";
import { toUsageViewModel } from "../../../renderer/src/domain/usage-view-model";
import {
  codexDual,
  codexNoQuota,
  zcodeLocalData,
  zcodeNoData,
} from "../../../renderer/src/domain/fixtures/snapshots";

afterEach(cleanup);

const NOW = () => new Date("2026-07-18T08:01:00.000Z");

function renderBar(snapshot: typeof codexDual, activeClient: string = "codex"): HTMLElement {
  const vm = toUsageViewModel({
    snapshot,
    error: null,
    activeClientId: activeClient,
    now: NOW,
  });
  const { container } = render(<IndicatorBarInner vm={vm} onClose={() => undefined} />);
  return container;
}

// ---------- Codex ----------

test("Bar Codex Dual: 品牌 Codex + 5H 42% + 周 64% + 今日 1.7M", () => {
  i18n.changeLanguage("zh-CN");
  renderBar(codexDual);
  assert.ok(screen.getAllByText("Codex").length > 0, "品牌 Codex");
  assert.ok(screen.getAllByText("42%").length > 0, "5H 42%");
  assert.ok(screen.getAllByText("64%").length > 0, "周 64%");
  assert.ok(screen.getAllByText("1.7M").length > 0, "今日 1.7M");
});

test("Bar Codex Dual: 2 个 IconButton（主题 + 关闭）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderBar(codexDual);
  const buttons = container.querySelectorAll("button");
  assert.ok(buttons.length >= 2, "至少 2 个按钮（主题 + 关闭）");
  const labels = Array.from(buttons).map((b) => b.getAttribute("aria-label") ?? "");
  assert.ok(labels.includes("切换主题"), "应有主题切换按钮");
  assert.ok(labels.includes("关闭"), "应有关闭按钮");
});

test("Bar Codex NoQuota: 5H 显示 —，不显示 0%/100%", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderBar(codexNoQuota);
  // 5H 段应显示 —（fiveHourQuota null）
  assert.ok(screen.getAllByText("—").length > 0, "5H 段占位 —");
  // 红线：不含 0% / 100%
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^(0|100)%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "不应含 0% 或 100%");
});

test("Bar Codex: 5H / 周段 label 出现（bar.fiveHourShort / bar.weeklyShort）", () => {
  i18n.changeLanguage("zh-CN");
  renderBar(codexDual);
  assert.ok(screen.getAllByText("5H").length > 0, "5H label");
  assert.ok(screen.getAllByText("周").length > 0, "周 label");
});

// ---------- ZCode ----------

test("Bar ZCode LocalData: ZCode + 今日 700K + 累计 392.8M + 模型 GLM-4.6V + 本机估算", () => {
  i18n.changeLanguage("zh-CN");
  renderBar(zcodeLocalData, "zcode");
  assert.ok(screen.getAllByText("ZCode").length > 0, "品牌 ZCode");
  assert.ok(screen.getAllByText("700K").length > 0, "今日 700K");
  assert.ok(screen.getAllByText("392.8M").length > 0, "累计 392.8M");
  assert.ok(screen.getAllByText("GLM-4.6V").length > 0, "模型 GLM-4.6V");
  assert.ok(screen.getAllByText("本机估算").length > 0, "本机估算 label");
});

test("Bar ZCode NoData: 今日 —，无虚构值", () => {
  i18n.changeLanguage("zh-CN");
  renderBar(zcodeNoData, "zcode");
  assert.ok(screen.getAllByText("—").length > 0, "今日占位 —");
  // 模型段也应显示 —（modelName fallback）
  assert.equal(screen.queryByText("GLM-4.6V"), null, "NoData 不应显示模型名");
});

// ---------- 红线守护 ----------

test("Bar ZCode 红线: DOM 不含 N% 配额数字（ZCode 永无配额）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderBar(zcodeLocalData, "zcode");
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^\d+(\.\d+)?%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "ZCode Bar 不应有 N% 数字");
});

// ---------- 结构 ----------

test("Bar 结构: GlassSurface surface=bar 高度 44px", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderBar(codexDual);
  const surface = container.firstElementChild as HTMLElement;
  assert.ok(surface);
  assert.equal(surface.style.height, "44px", "Bar surface 高度 44px");
  assert.equal(surface.style.width, "600px", "Bar surface 宽度 600px");
});
