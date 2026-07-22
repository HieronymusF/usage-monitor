import React from "react";
/**
 * EdgeCapsule 测试（v26：行为接入 + token 化 + IconButton 复用）。
 *
 * v26 架构（D-2 收尾）：
 * - ActionRail 复用 IconButton（size="rail" 40×40），自带 tooltip/hover/pressed/focus-visible
 * - 切换客户端 / 刷新 / 主题三态循环 接入真实 handler（不再 () => undefined）
 * - EdgeWing 收起控件改为 native <button>（键盘可达、Enter/Space、no-drag）
 * - 删除硬编码 hex/字号：颜色用 var(--c-*)、字号用 typography token
 * - 删除左侧主额度区重复「更新于」，只在今日 Token 下保留一次
 *
 * 几何（锁定，v21-v25）：
 * - 尺寸 720×180
 * - Grid：`repeat(3, minmax(0, 1fr))`（3 数据列等宽，功能栏在 RightControls）
 * - 主 ring orb、边缘 ring handle 48
 * - 2 条分隔线（重置 + 今日，120px）
 *
 * 红线（AGENTS.md / HANDOFF §7）：ZCode 不含 N% / 0% / 100%（visible text 查，L4）
 *
 * 期望值（dual fixture weekly remaining=64, today=1_650_000）：
 * - 主% = weekly 优先 = 64%
 * - 重置时间 = compact 格式（X天 / Xh Ym / Xm）
 * - formatToken(1_650_000) = "1.7M"
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import "../../../renderer/src/i18n";
import i18n from "i18next";
import {
  EdgeCapsule,
  EdgeCapsuleInner,
} from "../../../renderer/src/components/capsule/EdgeCapsule";
import type { ThemePreference } from "../../../renderer/src/stores/themeStore";
import { useThemeStore } from "../../../renderer/src/stores/themeStore";
import { useUsageStore } from "../../../renderer/src/stores/usageStore";
import { toUsageViewModel } from "../../../renderer/src/domain/usage-view-model";
import {
  codexDual,
  codexNoQuota,
  zcodeLocalData,
} from "../../../renderer/src/domain/fixtures/snapshots";

afterEach(cleanup);

const NOW = () => new Date("2026-07-18T08:01:00.000Z");

/** v26：所有 handler 默认 no-op stub，测试可注入 spy。themePreference 默认 auto。 */
function renderCapsule(
  snapshot: typeof codexDual,
  activeClient = "codex",
  handlers: {
    onClose?: () => void;
    onSwitchClient?: () => void;
    onRefresh?: () => void;
    onCycleTheme?: () => void;
    themePreference?: ThemePreference;
    /** 注入 error 让 vm.dataState 进 refresh-error/offline。默认 null。 */
    error?: unknown;
  } = {},
): HTMLElement {
  const vm = toUsageViewModel({
    snapshot,
    error: handlers.error ?? null,
    activeClientId: activeClient,
    now: NOW,
  });
  const noop = () => undefined;
  const { container } = render(
    <EdgeCapsuleInner
      vm={vm}
      onClose={handlers.onClose ?? noop}
      onSwitchClient={handlers.onSwitchClient ?? noop}
      onRefresh={handlers.onRefresh ?? noop}
      onCycleTheme={handlers.onCycleTheme ?? noop}
      themePreference={handlers.themePreference ?? "auto"}
    />,
  );
  return container;
}

/** 找 ActionRail 里的 IconButton（按 aria-label）。IconButton 渲染 native <button type="button">。 */
function findActionButton(container: HTMLElement, ariaLabel: string): HTMLButtonElement {
  const btns = Array.from(container.querySelectorAll("button"));
  const found = btns.find((b) => b.getAttribute("aria-label") === ariaLabel);
  assert.ok(found, `应找到 aria-label="${ariaLabel}" 的按钮`);
  return found as HTMLButtonElement;
}

/** 找 EdgeWing 收起控件（native button, aria-label="关闭"）。 */
function findCollapseButton(container: HTMLElement): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === "关闭",
  );
  assert.ok(btn, "应找到收起按钮（aria-label=关闭）");
  return btn as HTMLButtonElement;
}

// ---------- Codex 主体（数据渲染） ----------

test("Capsule Codex Dual: 主额度区 = CODEX·PLUS + 每周额度 + 64%", () => {
  i18n.changeLanguage("zh-CN");
  renderCapsule(codexDual);
  assert.ok(screen.getAllByText("CODEX · PLUS").length > 0, "产品名 CODEX·PLUS");
  assert.ok(screen.getAllByText("每周额度").length > 0, "每周额度标签");
  assert.ok(screen.getAllByText("64%").length > 0, "主百分比 64%（weekly 优先）");
});

test("v30 refresh-error: 短提示替换更新时间，保留完整 tooltip 和旧数据", () => {
  i18n.changeLanguage("zh-CN");
  // 注入 error 让 dataState=refresh-error（snapshot 保留 → client 非空 → 正常 body + 提示）
  renderCapsule(codexDual, "codex", { error: new Error("bridge down") });
  // 数据仍渲染（不替换成 loading 占位）
  assert.ok(screen.getAllByText("CODEX · PLUS").length > 0, "refresh-error 时数据仍渲染");
  assert.ok(screen.getAllByText("64%").length > 0, "主百分比仍显示");
  const hint = screen.getByText("刷新失败");
  assert.equal(hint.getAttribute("title"), "刷新失败 — 显示上次数据", "完整说明放 tooltip");
  assert.equal((hint as HTMLElement).style.overflow, "hidden", "状态行限制在当前数据列内");
  assert.equal((hint as HTMLElement).style.textOverflow, "ellipsis", "极端语言长度可省略");
  assert.equal(screen.queryByText(/更新于/), null, "错误状态用短提示替换更新时间，不横向追加");
});

test("Capsule Codex Dual: 重置区显示「重置」+ compact 倒计时", () => {
  i18n.changeLanguage("zh-CN");
  renderCapsule(codexDual);
  assert.ok(screen.getAllByText("重置").length > 0, "重置标签");
  const resetTexts = screen.getAllByText(/^\d+天$|^\d+h \d+m$|^\d+m$/);
  assert.ok(resetTexts.length > 0, "重置时间 compact 格式");
});

test("Capsule Codex Dual: 今日 Token 区显示数值 + 唯一一次「更新于」", () => {
  i18n.changeLanguage("zh-CN");
  renderCapsule(codexDual);
  assert.ok(screen.getAllByText("今日 Token").length > 0, "今日 Token 标题");
  assert.ok(screen.getAllByText("1.7M").length > 0, "今日数值 1.7M");
  // v26：「更新于」只在今日区出现一次（左侧主额度区已删除重复）
  const updateTexts = screen.getAllByText(/更新于/);
  assert.equal(updateTexts.length, 1, "v26: 更新于只出现一次（今日区），不应在主额度区重复");
});

test("Capsule Codex NoQuota: 主 metric —，不含 0%/100%", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexNoQuota);
  assert.ok(screen.getAllByText("—").length > 0, "主 metric 占位 —");
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^(0|100|\d+)%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "NoQuota 不应含百分比");
});

// ---------- ZCode 红线 ----------

test("Capsule ZCode LocalData: 今日 700K + 累计 392.8M + 模型 GLM-4.6V，不渲染配额百分比", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(zcodeLocalData, "zcode");
  assert.ok(screen.getAllByText("700K").length > 0, "今日 700K");
  assert.ok(screen.getAllByText("392.8M").length > 0, "累计 392.8M");
  assert.ok(screen.getAllByText("GLM-4.6V").length > 0, "模型 GLM-4.6V");
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^(0|100|\d+)%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "ZCode 不应含配额百分比");
});

// ---------- 结构（v21-v25 锁定几何） ----------

test("Capsule Codex Dual: 外层容器 720×180", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const wrapper = container.firstChild as HTMLElement;
  assert.ok(wrapper, "应有外层 wrapper");
  assert.equal(wrapper.style.width, "720px", "总宽 720");
  assert.equal(wrapper.style.height, "180px", "总高 180");
});

test("Capsule Codex Dual: Grid 3 列（repeat(3, 1fr)，功能栏移出 Grid）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const wrapper = container.firstChild as HTMLElement;
  const mainCard = wrapper.firstChild as HTMLElement;
  const contentLayer = mainCard.firstChild as HTMLElement;
  assert.equal(contentLayer.style.display, "grid", "内容层 display=grid");
  const template = contentLayer.style.gridTemplateColumns;
  assert.ok(
    template.includes("minmax(0, 1fr)") || template.includes("minmax(0,1fr)"),
    `gridTemplateColumns 含 repeat(3, minmax(0, 1fr))，实际: ${template}`,
  );
});

test("Capsule Codex Dual: Grid 只有 3 个直接子节点（3 section）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const wrapper = container.firstChild as HTMLElement;
  const mainCard = wrapper.firstChild as HTMLElement;
  const contentLayer = mainCard.firstChild as HTMLElement;
  assert.equal(
    contentLayer.children.length,
    3,
    `Grid 应有 3 个子节点（3 section），实际 ${contentLayer.children.length}`,
  );
});

test("Capsule Codex Dual: v25 只 2 条分隔线（DividerLine 120px）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const divs = Array.from(container.querySelectorAll("div"));
  const dividers = divs.filter((d) => {
    const st = (d as HTMLElement).style;
    return (
      st.position === "absolute" &&
      st.width === "1px" &&
      st.height === "120px" &&
      st.background &&
      st.background.includes("color-mix")
    );
  });
  assert.equal(dividers.length, 2, `应有 2 条 DividerLine，实际 ${dividers.length}`);
});

test("Capsule Codex Dual: 主 ring 用 orb，边缘 ring 用 handle 48", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const svgs = container.querySelectorAll("svg");
  const viewBoxes = Array.from(svgs).map((s) => s.getAttribute("viewBox") ?? "");
  assert.ok(
    viewBoxes.filter((v) => /^0 0 48 48$/.test(v)).length >= 1,
    "边缘 mini ring 是 handle 48×48",
  );
});

test("Capsule Codex Dual: 主卡片单一 SVG mask（borderRadius=0）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const wrapper = container.firstChild as HTMLElement;
  const mainCard = wrapper.firstChild as HTMLElement;
  assert.equal(mainCard.style.borderRadius, "0px", "主卡片 CSS borderRadius=0（mask 控制）");
  assert.ok(mainCard.style.maskImage || mainCard.style.webkitMaskImage, "应有 mask");
});

// ---------- 文字层级（v26 token 化后字号） ----------

test("Capsule Codex Dual: 文字层级 — 主% displayS(34px/700)", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const mainPercent = Array.from(container.querySelectorAll("span")).find(
    (s) => s.textContent === "64%",
  ) as HTMLElement;
  assert.ok(mainPercent, "应找到 64% span");
  // v26：displayStyle 用 typography.displayS token（fontSize 34）
  assert.equal(mainPercent.style.fontSize, "34px", "主% 34px（displayS token）");
  assert.equal(mainPercent.style.fontWeight, "700", "主% 字重 700");
});

test("Capsule Codex Dual: 重置区主数值 metricL(28px)，不截断", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const sections = container.querySelectorAll("section");
  const resetSection = sections[1];
  assert.ok(resetSection, "应有重置区 section");
  const valueSpans = Array.from(resetSection.querySelectorAll("span")).filter((s) => {
    const st = (s as HTMLElement).style;
    return st.fontSize === "28px";
  });
  assert.ok(valueSpans.length > 0, "重置区应有 28px 主数值（metricL token）");
  if (valueSpans.length > 0) {
    const st = (valueSpans[0] as HTMLElement).style;
    assert.equal(st.overflow, "visible", "overflow:visible（不截断）");
    assert.equal(st.textOverflow, "clip", "textOverflow:clip");
  }
});

test("Capsule Codex Dual: 边缘胶囊含迷你百分比 64% + 状态点 9px", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const collapseBtn = findCollapseButton(container);
  const texts = Array.from(collapseBtn.querySelectorAll("span")).map((s) => s.textContent ?? "");
  assert.ok(texts.includes("64%"), "边缘胶囊应含迷你百分比 64%");
  const statusDot = Array.from(collapseBtn.querySelectorAll("span")).find((s) => {
    const st = (s as HTMLElement).style;
    return st.width === "9px" && st.height === "9px";
  }) as HTMLElement;
  assert.ok(statusDot, "应有状态点（9px）");
});

// ---------- v26 行为测试：ActionRail 三个按钮 ----------

test("v26 行为: 点击「切换客户端」触发 onSwitchClient", () => {
  i18n.changeLanguage("zh-CN");
  let switched = 0;
  const container = renderCapsule(codexDual, "codex", {
    onSwitchClient: () => (switched += 1),
  });
  const btn = findActionButton(container, "切换客户端");
  fireEvent.click(btn);
  assert.equal(switched, 1, "点击切换客户端应调用 onSwitchClient 一次");
});

test("v26 行为: 点击「刷新」触发 onRefresh", () => {
  i18n.changeLanguage("zh-CN");
  let refreshed = 0;
  const container = renderCapsule(codexDual, "codex", {
    onRefresh: () => (refreshed += 1),
  });
  const btn = findActionButton(container, "刷新");
  fireEvent.click(btn);
  assert.equal(refreshed, 1, "点击刷新应调用 onRefresh 一次");
});

test("v26 行为: 点击「主题」触发 onCycleTheme", () => {
  i18n.changeLanguage("zh-CN");
  let cycled = 0;
  const container = renderCapsule(codexDual, "codex", {
    onCycleTheme: () => (cycled += 1),
  });
  // themePreference=auto → label="主题：跟随系统"
  const btn = findActionButton(container, "主题：跟随系统");
  fireEvent.click(btn);
  assert.equal(cycled, 1, "点击主题应调用 onCycleTheme 一次");
});

test("v26 行为: 主题按钮 label 随 preference 变化（auto/light/dark）", () => {
  i18n.changeLanguage("zh-CN");
  // auto
  const c1 = renderCapsule(codexDual, "codex", { themePreference: "auto" });
  assert.doesNotThrow(() => findActionButton(c1, "主题：跟随系统"), "auto → 跟随系统");
  cleanup();
  // light
  const c2 = renderCapsule(codexDual, "codex", { themePreference: "light" });
  assert.doesNotThrow(() => findActionButton(c2, "主题：浅色"), "light → 浅色");
  cleanup();
  // dark
  const c3 = renderCapsule(codexDual, "codex", { themePreference: "dark" });
  assert.doesNotThrow(() => findActionButton(c3, "主题：深色"), "dark → 深色");
});

// ---------- v26 行为测试：EdgeWing 收起控件（native button） ----------

test("v26 行为: 收起控件是 native <button>（非 div role=button）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const collapseBtn = findCollapseButton(container);
  assert.equal(collapseBtn.tagName, "BUTTON", "收起控件应是 native <button>");
  assert.equal(collapseBtn.getAttribute("type"), "button", "type=button");
  // v26：不再有 role="button"（native button 不需要）
  assert.equal(collapseBtn.getAttribute("role"), null, "native button 不应有 role=button");
});

test("v26 行为: 点击收起控件触发 onClose", () => {
  i18n.changeLanguage("zh-CN");
  let closed = false;
  const container = renderCapsule(codexDual, "codex", { onClose: () => (closed = true) });
  const collapseBtn = findCollapseButton(container);
  fireEvent.click(collapseBtn);
  assert.ok(closed, "点击收起应触发 onClose");
});

test("v26 行为: 收起控件透明背景 + z-index 3（高于翼片 SVG）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const collapseBtn = findCollapseButton(container);
  assert.equal(collapseBtn.style.background, "transparent", "透明背景");
  assert.equal(collapseBtn.style.zIndex, "3", "z-index=3");
});

// ---------- v26 IconButton 复用：tooltip + 可聚焦 ----------

test("v26 IconButton: ActionRail 三个按钮都有 title（tooltip，来自 aria-label）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const rail = container.querySelector("div[style*='58px']") ?? container;
  const actionBtns = [
    findActionButton(container, "切换客户端"),
    findActionButton(container, "刷新"),
    findActionButton(container, "主题：跟随系统"),
  ];
  for (const btn of actionBtns) {
    const title = btn.getAttribute("title");
    const aria = btn.getAttribute("aria-label");
    assert.ok(title, `按钮应有 title（tooltip）`);
    assert.equal(title, aria, `title 应等于 aria-label`);
  }
  void rail;
});

test("v26 IconButton: ActionRail 按钮尺寸 40px（rail 变体）", () => {
  i18n.changeLanguage("zh-CN");
  const container = renderCapsule(codexDual);
  const btn = findActionButton(container, "切换客户端");
  // IconButton 用 surfaceSizes.iconButton.rail = 40
  assert.equal(btn.style.width, "40px", "rail 按钮宽 40px");
  assert.equal(btn.style.height, "40px", "rail 按钮高 40px");
});

// ---------- v27 外层 EdgeCapsule 真实接线测试（不只 Inner stub） ----------
//
// 测试外层 EdgeCapsule 的真实 store/bridge 接线：
// - onClose → window.monitor.showSurface("orb")（不再 window.close）
// - onRefresh → window.monitor.refreshUsage
// - onSwitchClient → usageStore.setActiveClient
//
// 外层调 useUsageViewModel（useSWR→window.monitor），需 mock window.monitor + 用 preview 模式
// 注入 fixture（避免真实 bridge 调用）。

/** 设置 jsdom 的 URL 含 ?preview=dual，让 useUsageViewModel 走 fixture 路径。 */
function setPreviewUrl(preview: string): void {
  const w = globalThis as { window: Window & { location: { search: string } } };
  w.window.location.search = `?preview=${preview}`;
}

/** 还原 URL（避免污染后续 Inner 测试）。 */
function clearPreviewUrl(): void {
  const w = globalThis as { window: Window & { location: { search: string } } };
  w.window.location.search = "";
}

/** 装 window.monitor mock，返回调用记录。 */
function installMockMonitor(): {
  showSurfaceCalls: string[];
  refreshCalls: number;
} {
  const showSurfaceCalls: string[] = [];
  const refreshCalls = { value: 0 };
  (globalThis as { window: typeof globalThis & { monitor?: unknown } }).window.monitor = {
    getContext: async () => ({ platform: "win32", surface: "edge-capsule", systemTheme: "light" }),
    getUsage: async () => codexDual,
    refreshUsage: async () => {
      refreshCalls.value += 1;
      return codexDual;
    },
    showSurface: (kind: string) => {
      showSurfaceCalls.push(kind);
    },
    onSystemThemeChange: () => () => {},
    resizeCardWindow: () => {},
  };
  return {
    showSurfaceCalls,
    get refreshCalls() {
      return refreshCalls.value;
    },
  };
}

test("v27 外层: 收起按钮调用 window.monitor.showSurface('orb')（不退出应用）", async () => {
  i18n.changeLanguage("zh-CN");
  setPreviewUrl("dual");
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  const monitor = installMockMonitor();

  const { container } = render(React.createElement(EdgeCapsule));

  // 等数据加载（preview 模式 fixture 同步可用，但等一帧确保 render 完成）
  await waitFor(() => {
    assert.ok(screen.getAllByText("CODEX · PLUS").length > 0, "应渲染 Codex 数据");
  });

  const collapseBtn = findCollapseButton(container);
  fireEvent.click(collapseBtn);

  // v27：收起调 showSurface("orb")，不再 window.close()
  assert.deepEqual(monitor.showSurfaceCalls, ["orb"], "收起应调用 showSurface('orb')");
  clearPreviewUrl();
});

test("v27 外层: 点击刷新调用 window.monitor.refreshUsage", async () => {
  i18n.changeLanguage("zh-CN");
  setPreviewUrl("dual");
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  const monitor = installMockMonitor();

  const { container } = render(React.createElement(EdgeCapsule));
  await waitFor(() => {
    assert.ok(screen.getAllByText("CODEX · PLUS").length > 0);
  });

  const btn = findActionButton(container, "刷新");
  fireEvent.click(btn);

  await waitFor(() => {
    assert.ok(monitor.refreshCalls >= 1, "点击刷新应调用 refreshUsage");
  });
  clearPreviewUrl();
});

test("v27 外层: 点击切换客户端改变 usageStore.activeClient", async () => {
  i18n.changeLanguage("zh-CN");
  setPreviewUrl("dual");
  useUsageStore.setState({ snapshot: null, error: null, activeClient: "codex" });
  useThemeStore.setState({ preference: "auto", resolved: "light", systemTheme: "light" });
  installMockMonitor();

  const { container } = render(React.createElement(EdgeCapsule));
  await waitFor(() => {
    assert.ok(screen.getAllByText("CODEX · PLUS").length > 0);
  });

  assert.equal(useUsageStore.getState().activeClient, "codex", "初始 activeClient=codex");
  const btn = findActionButton(container, "切换客户端");
  fireEvent.click(btn);

  // v27：切换客户端调 setActiveClient（codex→zcode）
  assert.equal(useUsageStore.getState().activeClient, "zcode", "点击后 activeClient 应变 zcode");
  clearPreviewUrl();
});
