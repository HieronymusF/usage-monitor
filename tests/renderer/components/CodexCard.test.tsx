import React from "react";
/**
 * Codex Card quota 子组件矩阵测试。
 *
 * 覆盖 visual-spec §5 Codex 4 个 quotaState 的视觉差异核心：
 * - Dual: FiveHourHero (5h 42%) + SidePanel→WeeklySideRing (weekly 64% ring)
 * - WeeklyOnly: WeeklyHeroRing (weekly 64%) + SidePanel→TodayTokenPanel (今日 1.2M + 本机累计 100M)
 * - FiveOnly: FiveHourHero (5h 42%) + SidePanel→WeeklyUnavailablePanel ("每周" + "服务未提供")
 * - NoQuota: UnavailableHero + SidePanel→EmptyPanel
 *
 * 测试边界（与 ZCodeCard.test 同款，AGENT_LESSONS L5）：
 * - 不测整张 CodexCard：CardHeader 用 @/stores，tsx loader 在 node:test 下不解析 paths。
 * - 测 quota/* 4 个子组件 + SidePanel 4 态分支路由，这是 quotaState 视觉差异核心。
 * - 结构胶水（GlassSurface + Grid + CardHeader + TokenTray）靠 dev 视觉验证兜底。
 *
 * 红线守护（visual-spec §5）：
 * - NoQuota: 不显示 0% / 100% / 估算值
 * - FiveOnly: 不画 0% weekly 圆环（右侧只"每周" + "服务未提供"）
 *
 * 期望值来源（AGENT_LESSONS L5/G4，不反推实现）：
 * - formatToken(1_650_000) = "1.7M"（ Intl 1 位小数 round）
 * - formatToken(125_000_000) = "125M"
 * - formatToken(1_200_000) = "1.2M"
 * - formatToken(100_000_000) = "100M"
 * - formatToken(700_000) = "700K"
 * - formatToken(80_000_000) = "80M"
 * - vm.quotaState 由 classify-quota 派生：dual/weekly-only/five-only/unavailable（已 node 一行验证）
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import "../../../renderer/src/i18n";
import i18n from "i18next";
import { FiveHourHero } from "../../../renderer/src/components/card/quota/FiveHourHero";
import { WeeklyHeroRing } from "../../../renderer/src/components/card/quota/WeeklyHeroRing";
import { UnavailableHero } from "../../../renderer/src/components/card/quota/UnavailableHero";
import { SidePanel } from "../../../renderer/src/components/card/quota/SidePanel";
import { toClientUsageViewModel } from "../../../renderer/src/domain/usage-view-model";
import {
  codexDual,
  codexFiveOnly,
  codexNoQuota,
  codexWeeklyOnly,
} from "../../../renderer/src/domain/fixtures/snapshots";

afterEach(cleanup);

const NOW = () => new Date("2026-07-18T08:01:00.000Z");

function clientOf(snap: typeof codexDual) {
  return toClientUsageViewModel(snap.clients.codex!, NOW);
}

// ---------- FiveHourHero（Dual + FiveOnly 左侧）----------

test("FiveHourHero Dual: 显示 5h 剩余百分比 42 + % 单位 + caption '5 小时剩余'", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  render(<FiveHourHero quota={client.primaryQuota} now={NOW} />);
  // 剩余 42% → 数字 "42" + 单位 "%"
  assert.ok(screen.getByText("42"), "5h 剩余数字 42 应出现");
  assert.ok(screen.getAllByText("%").length > 0, "% 单位应出现");
  assert.ok(screen.getAllByText("5 小时剩余").length > 0, "caption 应为 '5 小时剩余'");
});

test("FiveHourHero: 数字父 span 应用 displayXL 字号 92px", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  const { container } = render(<FiveHourHero quota={client.primaryQuota} now={NOW} />);
  // MetricValue 渲染结构：外 span > (label span) + 内 span[fontSize=92px] > (value span + unit span)
  // 数字 "42" 在 value span（无 inline fontSize，继承父），所以查父 span 的 fontSize=92px
  const xlSpans = Array.from(container.querySelectorAll("span")).filter(
    (el) => (el as HTMLElement).style?.fontSize === "92px",
  );
  assert.ok(xlSpans.length > 0, "FiveHourHero 应有 displayXL (92px) 字号的 span");
});

test("FiveHourHero: QuotaRail 进度条 role=progressbar 存在（5h Hero 有横条）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  const { container } = render(<FiveHourHero quota={client.primaryQuota} now={NOW} />);
  const rail = container.querySelector('[role="progressbar"]');
  assert.ok(rail, "QuotaRail role=progressbar 应存在");
});

test("FiveHourHero: remaining=42 → health=low → StatusLabel 显示'偏低'", () => {
  i18n.changeLanguage("zh-CN");
  // 42 在 20-49 区间 → low → 中文"偏低"
  const client = clientOf(codexDual);
  render(<FiveHourHero quota={client.primaryQuota} now={NOW} />);
  assert.ok(screen.getAllByText("偏低").length > 0, "remaining=42 应分类为 low (偏低)");
});

// ---------- WeeklyHeroRing（WeeklyOnly 左侧）----------

test("WeeklyHeroRing: 显示 weekly 剩余 64% + ring svg (frame=198)", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexWeeklyOnly);
  const { container } = render(<WeeklyHeroRing quota={client.primaryQuota} now={NOW} />);
  assert.ok(screen.getByText("64"), "weekly 剩余数字 64 应出现");
  const svg = container.querySelector("svg");
  assert.ok(svg, "ring svg 应存在");
  assert.equal(svg?.getAttribute("width"), "198", "ring frame=198");
});

test("WeeklyHeroRing: 大数字应用 displayL 字号 60px（不是 5h 的 92px）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexWeeklyOnly);
  const { container } = render(<WeeklyHeroRing quota={client.primaryQuota} now={NOW} />);
  const heroSpan = Array.from(container.querySelectorAll("span")).find(
    (el) => el.textContent === "64" && el.style.fontSize === "60px",
  );
  assert.ok(heroSpan, "weekly Hero 数字应用 displayL (60px)，区别于 5h 的 92px");
});

// ---------- WeeklyHeroRing 简版 ring 几何契约（2026-07-19 重写）----------
//
// 用户 2026-07-19 要求把 weekly hero 从 ProgressRing 6 层结构改为标准 2 层 ring：
// - 不用 ProgressRing 共享组件（避免起点 halo+珠+圆头叠加导致端点不对称）
// - rail + progress 两个 circle，dasharray 控进度，rotate(-90) 起 12 点
// - 无刻度（用户决策：无业务含义）、无渐变（用户要求"清晰品牌蓝"）、无 halo/border/innerDisc/startKnob
// 下列断言守护这些契约。ProgressRing 共享组件不动，仍由 28 个几何测试守护。

test("WeeklyHeroRing 几何: rail 和 progress 各 1 个 r=95 circle，无刻度 line", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexWeeklyOnly);
  const { container } = render(<WeeklyHeroRing quota={client.primaryQuota} now={NOW} />);
  // ring circles 都是 r=95（ringGeometry.hero.diameter/2）。
  // Clock 图标也含 circle（钟面 r=10），不在这个集合里。
  const ringCircles = Array.from(container.querySelectorAll("svg circle")).filter(
    (c) => c.getAttribute("r") === "95",
  );
  const lines = container.querySelectorAll("svg line");
  assert.equal(ringCircles.length, 2, "应只有 rail + progress 2 个 r=95 ring circle");
  assert.equal(
    lines.length,
    0,
    "不应有刻度 line（用户决策：删全部刻度；Clock 图标的 line 是时针不是刻度）",
  );
});

/** 取 WeeklyHeroRing 的 rail + progress 两个 r=95 ring circle（过滤掉 Clock 图标的钟面 circle）。 */
function ringCirclesOf(container: HTMLElement, radius: number): Element[] {
  return Array.from(container.querySelectorAll("svg circle")).filter(
    (c) => c.getAttribute("r") === String(radius),
  );
}

test("WeeklyHeroRing 几何: rail 无 dasharray（完整背景轨道），progress dasharray 精确 = 64% × 周长", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexWeeklyOnly);
  const { container } = render(<WeeklyHeroRing quota={client.primaryQuota} now={NOW} />);
  const [rail, progress] = ringCirclesOf(container, 95);
  assert.ok(rail && progress, "应有 rail + progress 2 个 ring circle");
  // rail 无 dasharray（unavailable 时才有虚线，这里是 64% 有效值）
  assert.ok(!rail.getAttribute("stroke-dasharray"), "rail 不应有 dasharray");
  // progress dasharray 第一段 = 64% × 周长
  const dash = progress.getAttribute("stroke-dasharray");
  assert.ok(dash, "progress 应有 dasharray");
  const drawn = parseFloat(dash!.split(" ")[0] ?? "");
  const circumference = 2 * Math.PI * 95; // r=95（ringGeometry.hero.diameter/2）
  const expected = circumference * 0.64;
  assert.ok(
    Math.abs(drawn - expected) < 0.01,
    `progress dash 第一段应 = 64% 周长 (${expected.toFixed(2)})，实际 ${drawn}`,
  );
});

test("WeeklyHeroRing 几何: rail 用 c-rail 浅灰蓝，progress 用 c-accent-start 纯色（无渐变）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexWeeklyOnly);
  const { container } = render(<WeeklyHeroRing quota={client.primaryQuota} now={NOW} />);
  const [rail, progress] = ringCirclesOf(container, 95);
  assert.ok(rail && progress);
  assert.equal(rail.getAttribute("stroke"), "var(--c-rail)", "rail 用 c-rail token");
  assert.equal(
    progress.getAttribute("stroke"),
    "var(--c-accent-start)",
    "progress 用 c-accent-start 纯色，不用渐变 url()",
  );
});

test("WeeklyHeroRing 几何: rotate(-90) 让进度从 12 点起；progress 端点圆头对称", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexWeeklyOnly);
  const { container } = render(<WeeklyHeroRing quota={client.primaryQuota} now={NOW} />);
  const g = container.querySelector("svg g");
  assert.ok(g, "svg 内应有 <g> 包裹（rotate 应用层）");
  const transform = g!.getAttribute("transform") ?? "";
  assert.ok(/rotate\(-90/.test(transform), "g 应有 rotate(-90) 让 0% 起 12 点");
  const [rail, progress] = ringCirclesOf(container, 95);
  assert.ok(rail && progress);
  assert.equal(
    rail.getAttribute("stroke-linecap"),
    "round",
    "rail 端点圆头（虽然 rail 是闭合圆，linecap 无副作用但保持一致）",
  );
  assert.equal(
    progress.getAttribute("stroke-linecap"),
    "round",
    "progress 两端圆头对称（用户需求五.5）",
  );
});

// ---------- UnavailableHero（NoQuota 左侧）----------

test("UnavailableHero: 显示'配额 — 服务未提供'（不显示 0%/100%/估算值）", () => {
  i18n.changeLanguage("zh-CN");
  render(<UnavailableHero />);
  assert.ok(screen.getAllByText("配额 — 服务未提供").length > 0);
});

test("UnavailableHero: StatusLabel 显示'服务未提供'", () => {
  i18n.changeLanguage("zh-CN");
  render(<UnavailableHero />);
  assert.ok(screen.getAllByText("服务未提供").length > 0);
});

test("红线: UnavailableHero 不渲染任何 N% 配额数字", () => {
  i18n.changeLanguage("zh-CN");
  const { container } = render(<UnavailableHero />);
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^\d+(\.\d+)?%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "NoQuota 不应显示 N% 数字");
});

// ---------- SidePanel 4 态分支路由 ----------

test("SidePanel Dual: 渲染 WeeklySideRing（weekly 圆环 + remaining 64）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  // WeeklySideRing 简版 ring：frame=126
  const svg = container.querySelector("svg");
  assert.ok(svg, "Dual SidePanel 应渲染 ring svg");
  assert.equal(svg?.getAttribute("width"), "126", "SidePanel Dual ring frame=126");
  assert.ok(screen.getByText("64"), "weekly 剩余 64 应在 SidePanel ring 中心");
});

// ---------- WeeklySideRing 简版 ring 几何契约（2026-07-19 重写）----------
//
// 与 WeeklyHeroRing 同款（第 2 处简版 ring，不抽共享组件）。
// ringGeometry.side = { frame:126, diameter:118, stroke:7 }，RADIUS=59，CIRCUMFERENCE=370.708。
// 64% → dash first segment = 237.25。

test("WeeklySideRing 几何: rail 和 progress 各 1 个 r=59 circle", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  const sideRings = ringCirclesOf(container, 59);
  assert.equal(sideRings.length, 2, "应只有 rail + progress 2 个 r=59 ring circle");
});

test("WeeklySideRing 几何: rail 无 dasharray，progress dasharray 精确 = 64% × 周长 (237.25)", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  const [rail, progress] = ringCirclesOf(container, 59);
  assert.ok(rail && progress);
  assert.ok(!rail.getAttribute("stroke-dasharray"), "rail 不应有 dasharray");
  const dash = progress.getAttribute("stroke-dasharray");
  assert.ok(dash, "progress 应有 dasharray");
  const drawn = parseFloat(dash!.split(" ")[0] ?? "");
  const circumference = 2 * Math.PI * 59;
  const expected = circumference * 0.64;
  assert.ok(
    Math.abs(drawn - expected) < 0.01,
    `progress dash 第一段应 = 64% 周长 (${expected.toFixed(2)})，实际 ${drawn}`,
  );
});

test("WeeklySideRing 几何: rail 用 c-rail，progress 用 c-accent-start 纯色（与 hero 一致）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  const [rail, progress] = ringCirclesOf(container, 59);
  assert.ok(rail && progress);
  assert.equal(rail.getAttribute("stroke"), "var(--c-rail)");
  assert.equal(progress.getAttribute("stroke"), "var(--c-accent-start)", "无渐变");
});

test("WeeklySideRing 几何: rotate(-90) + 两端 stroke-linecap=round", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexDual);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  const g = container.querySelector("svg g");
  assert.ok(g);
  assert.ok(/rotate\(-90/.test(g!.getAttribute("transform") ?? ""), "rotate(-90) 起 12 点");
  const [rail, progress] = ringCirclesOf(container, 59);
  assert.ok(rail && progress);
  assert.equal(rail.getAttribute("stroke-linecap"), "round");
  assert.equal(progress.getAttribute("stroke-linecap"), "round", "两端圆头对称");
});

test("SidePanel WeeklyOnly: 渲染 TodayTokenPanel（今日 + 本机累计，无圆环）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexWeeklyOnly);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  // 今日 1_200_000 → formatToken = "1.2M"
  assert.ok(screen.getAllByText("1.2M").length > 0, "WeeklyOnly SidePanel 今日应显示 1.2M");
  // 本机累计 100_000_000 → "100M"
  assert.ok(screen.getAllByText("100M").length > 0, "WeeklyOnly SidePanel 本机累计应显示 100M");
  // 不应有圆环（TodayTokenPanel 是纯文本栈）
  assert.equal(container.querySelector("svg"), null, "WeeklyOnly SidePanel 不应有 ProgressRing");
});

test("SidePanel FiveOnly: 渲染 WeeklyUnavailablePanel（'每周' + '服务未提供'，无 0% 圆环）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexFiveOnly);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  assert.ok(screen.getAllByText("每周").length > 0, "FiveOnly SidePanel caption 应为 '每周'");
  assert.ok(screen.getAllByText("服务未提供").length > 0, "FiveOnly SidePanel 应显示 '服务未提供'");
  // 红线：FiveOnly 不画 0% 圆环
  assert.equal(
    container.querySelector("svg"),
    null,
    "FiveOnly SidePanel 不应有 ProgressRing（红线：不画 0% 圆环）",
  );
});

test("SidePanel NoQuota: 渲染 EmptyPanel（width 126 占位，无内容）", () => {
  i18n.changeLanguage("zh-CN");
  const client = clientOf(codexNoQuota);
  const { container } = render(
    <SidePanel
      quotaState={client.quotaState}
      secondaryQuota={client.secondaryQuota}
      client={client}
      now={NOW}
    />,
  );
  // EmptyPanel 是 <div style="width: 126px" />，无文本无 svg
  assert.equal(container.querySelector("svg"), null, "NoQuota SidePanel 不应有 ProgressRing");
  // 找到 width 126 的空 div
  const emptyDiv = Array.from(container.querySelectorAll("div")).find(
    (el) => (el as HTMLElement).style?.width === "126px" && el.children.length === 0,
  );
  assert.ok(emptyDiv, "NoQuota SidePanel 应是 EmptyPanel (126px 空占位)");
});

// ---------- quotaState 路由正确性（已 node 验证，此处作为契约守护）----------

test("契约守护: codexDual fixture 解析为 quotaState=dual + primary 42% + secondary 64%", () => {
  const client = clientOf(codexDual);
  assert.equal(client.quotaState, "dual");
  assert.equal(client.primaryQuota?.remainingPercent, 42);
  assert.equal(client.secondaryQuota?.remainingPercent, 64);
});

test("契约守护: codexWeeklyOnly fixture 解析为 quotaState=weekly-only + primary 64%", () => {
  const client = clientOf(codexWeeklyOnly);
  assert.equal(client.quotaState, "weekly-only");
  assert.equal(client.primaryQuota?.remainingPercent, 64);
  assert.equal(client.secondaryQuota, null);
});

test("契约守护: codexFiveOnly fixture 解析为 quotaState=five-only + primary 42%", () => {
  const client = clientOf(codexFiveOnly);
  assert.equal(client.quotaState, "five-only");
  assert.equal(client.primaryQuota?.remainingPercent, 42);
  assert.equal(client.secondaryQuota, null);
});

test("契约守护: codexNoQuota fixture 解析为 quotaState=unavailable + 无配额", () => {
  const client = clientOf(codexNoQuota);
  assert.equal(client.quotaState, "unavailable");
  assert.equal(client.primaryQuota, null);
  assert.equal(client.secondaryQuota, null);
});
