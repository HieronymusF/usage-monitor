import React from "react";
/**
 * Orb 测试（Milestone D-2 v3，对齐 03 设计稿）。
 *
 * v3 变更（用户反馈 8 条）：
 * - 窗口 84×120 → 96×140（visible 72×108 → 88×132）
 * - radius.orb 36 → 22（两侧有直边，修长胶囊）
 * - 主数字从 weekly 改 5h（对齐设计稿 42% = dual fixture 5h remaining）
 * - 字号层级：metricM 22→20、caption 13→12（设计稿要求"主缩 10-15%/次缩 20-25%"）
 * - 主/次间距 0→3px
 * - grip dots opacity 0.5→0.85，color tertiary→secondary（深、清晰）
 * - ring 垂直位置上移（marginTop 12）
 * - 主配额：Dual→5h（设计稿对齐），WeeklyOnly→weekly fallback
 *
 * 布局契约（03-orb-edge-capsule-states.png）：
 * 1. 顶部 3 个 grip dots（深灰，opacity 0.85）
 * 2. 中部偏上圆环（Orb Ring 60×60）+ 内盘：主数字（20px）+ 小标签（12px，gap 3）
 * 3. 底部状态点（健康度色，marginTop auto 推到底）
 *
 * 红线（AGENTS.md / HANDOFF §7）：
 * - ZCode 不含 N% / 0% / 100%（查 visible text，L4）
 * - Codex NoQuota 不含 0% / 100%
 *
 * 期望值（dual fixture primary 5h remaining=42，secondary weekly remaining=64）：
 * - v3 主数字 = 5h = 42%（对齐设计稿 42%）
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import "../../../renderer/src/i18n";
import i18n from "i18next";
import { OrbInner } from "../../../renderer/src/components/orb/Orb";
import { toUsageViewModel } from "../../../renderer/src/domain/usage-view-model";
import {
  codexDual,
  codexWeeklyOnly,
  codexFiveOnly,
  codexNoQuota,
  zcodeLocalData,
  zcodeNoData,
} from "../../../renderer/src/domain/fixtures/snapshots";

afterEach(cleanup);

const NOW = () => new Date("2026-07-18T08:01:00.000Z");

function renderOrb(snapshot: typeof codexDual, activeClient: string = "codex"): HTMLElement {
  const vm = toUsageViewModel({
    snapshot,
    error: null,
    activeClientId: activeClient,
    now: NOW,
  });
  const { container } = render(<OrbInner vm={vm} />);
  return container;
}

// ---------- Codex 4 态 ----------

test("Orb Codex Dual: 主数字 42% + 5H 标签（v3：5h 优先，对齐设计稿 42%）", () => {
  i18n.changeLanguage("zh-CN");
  renderOrb(codexDual);
  // v3：5h 优先。dual fixture primary 5h remaining=42。
  assert.ok(screen.getAllByText("42%").length > 0, "主数字 5H 42%");
  assert.ok(screen.getAllByText("5H").length > 0, "5H 标签");
});

test("Orb Codex WeeklyOnly: 无 5h → fallback weekly，主数字 64% + 周标签", () => {
  i18n.changeLanguage("zh-CN");
  renderOrb(codexWeeklyOnly);
  // WeeklyOnly 没 5h，fallback weekly。primary weekly remaining=64。
  assert.ok(screen.getAllByText("64%").length > 0, "主数字 周 64%");
  assert.ok(screen.getAllByText("周").length > 0, "周 标签");
});

test("Orb Codex FiveOnly: 主数字 42% + 5H 标签（primary 5h remaining=42）", () => {
  i18n.changeLanguage("zh-CN");
  renderOrb(codexFiveOnly);
  assert.ok(screen.getAllByText("42%").length > 0, "主数字 5H 42%");
  assert.ok(screen.getAllByText("5H").length > 0, "5H 标签");
});

test("Orb Codex NoQuota: 主数字 —，不含 0%/100%", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexNoQuota);
  assert.ok(screen.getAllByText("—").length > 0, "主数字占位 —");
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^(0|100|\d+)%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "NoQuota 不应含百分比");
});

// ---------- ZCode 红线 ----------

test("Orb ZCode LocalData: 主数字 700K + 今日标签，不渲染配额百分比", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(zcodeLocalData, "zcode");
  assert.ok(screen.getAllByText("700K").length > 0, "今日 700K（大数字）");
  assert.ok(screen.getAllByText("今日").length > 0, "今日 标签");
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^(0|100|\d+)%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "ZCode 不应含配额百分比");
});

test("Orb ZCode NoData: 主数字 — + 今日标签", () => {
  i18n.changeLanguage("zh-CN");
  renderOrb(zcodeNoData, "zcode");
  assert.ok(screen.getAllByText("—").length > 0, "主数字占位 —");
  assert.ok(screen.getAllByText("今日").length > 0, "今日 标签");
});

// ---------- 结构：v3 几何 ----------

test("Orb Codex Dual: GlassSurface surface=orb，visible 尺寸 82×136（v6 新尺寸）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const surface = container.firstChild as HTMLElement;
  assert.ok(surface, "应渲染 GlassSurface 根");
  assert.equal(surface.style.width, "82px", "v6 visible width=82");
  assert.equal(surface.style.height, "136px", "v6 visible height=136");
});

test("Orb Codex Dual: ProgressRing 存在（v6 Orb Ring 62×62）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const svg = container.querySelector("svg");
  assert.ok(svg, "应有 ProgressRing svg");
  assert.match(svg?.getAttribute("viewBox") ?? "", /^0 0 62 62$/, "v6 Orb ring viewBox=62×62");
});

test("Orb Codex Dual: 顶部 3 个 grip dots（实色 --c-secondary，v4 无 opacity 模糊）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const allDivs = Array.from(container.querySelectorAll("div"));
  const gripContainer = allDivs.find((d) => {
    const spans = Array.from(d.querySelectorAll(":scope > span"));
    return (
      spans.length === 3 &&
      spans.every((s) => (s as HTMLElement).style.borderRadius === "50%") &&
      spans.every((s) => (s as HTMLElement).style.background === "var(--c-secondary)") &&
      spans.every((s) => (s as HTMLElement).style.opacity === "1")
    );
  });
  assert.ok(gripContainer, "应有顶部 3 个 grip dots，实色 opacity=1（v4 无模糊）");
});

test("Orb Codex Dual: GlassSurface 局部去 border + box-shadow（v4 去黑边感）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const surface = container.firstChild as HTMLElement;
  // React 把 border:"none" 渲染成 borderWidth:0px，检查 borderWidth
  assert.equal(surface.style.borderWidth, "0px", "v4: border 宽度=0（去共享层 border）");
  assert.ok(surface.style.boxShadow.includes("inset"), "v4: 用 inset box-shadow 表达边缘高光");
});

test("Orb Codex Dual: ring 容器绝对定位 top=23px（v6 中上位置，禁用 space-between）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const svg = container.querySelector("svg");
  assert.ok(svg, "应有 ProgressRing");
  const ringWrapper = svg?.parentElement as HTMLElement;
  assert.ok(ringWrapper, "ring 应有包裹 div");
  assert.equal(ringWrapper.style.position, "absolute", "v6: ring 容器绝对定位");
  assert.equal(ringWrapper.style.top, "23px", "v6: ring 距 capsule 顶 23px（中上 40%）");
  // capsule 高 136，ring 62，中心 = 23+31 = 54，54/136 = 40%（中上）
  assert.equal(ringWrapper.style.width, "62px", "v6: ring 62×62（-6%）");
  assert.equal(ringWrapper.style.height, "62px", "v6: ring 62×62（-6%）");
});

test("Orb Codex Dual: 状态点 7px（v6 从 8 改 7）+ 距 ring 底 16px", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const surface = container.firstChild as HTMLElement;
  const statusDot = surface.lastChild as HTMLElement;
  assert.ok(statusDot, "应有状态点");
  // v6：top = ringTop(23) + ringFrame(62) + statusTopFromRingBottom(16) = 101
  assert.equal(statusDot.style.top, "101px", "v6: 状态点 top=101px（距 ring 底 16px）");
  assert.equal(statusDot.style.width, "7px", "v6: 状态点 7px");
  assert.equal(statusDot.style.height, "7px", "v6: 状态点 7px");
  // dual 5h remaining=42 → low → 橙
  assert.equal(statusDot.style.background, "var(--c-warning)", "健康度 low=橙色");
});

test("Orb Codex Dual: 主数字字号 20px / 字重 500（v3 从 22/600 缩到 20/500）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const percentSpan = Array.from(container.querySelectorAll("span")).find(
    (s) => s.textContent === "42%",
  ) as HTMLElement;
  assert.ok(percentSpan, "应找到 42% span");
  assert.equal(percentSpan.style.fontSize, "20px", "主数字 20px (v3)");
  assert.equal(percentSpan.style.fontWeight, "500", "字重 500 (v3 降一级)");
});

test("Orb Codex Dual: 标签字号 12px（v3 从 13 缩到 12）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(codexDual);
  const labelSpan = Array.from(container.querySelectorAll("span")).find(
    (s) => s.textContent === "5H",
  ) as HTMLElement;
  assert.ok(labelSpan, "应找到 5H span");
  assert.equal(labelSpan.style.fontSize, "12px", "标签 12px (v3)");
});

test("Orb ZCode LocalData: 底部状态点为灰（unavailable）+ v6 尺寸 7px", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderOrb(zcodeLocalData, "zcode");
  const surface = container.firstChild as HTMLElement;
  const lastChild = surface.lastChild as HTMLElement;
  assert.equal(lastChild.style.background, "var(--c-tertiary)", "ZCode 健康度=灰（unavailable）");
  assert.equal(lastChild.style.width, "7px", "v6: 状态点 7px");
});
