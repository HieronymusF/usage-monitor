import React from "react";
/**
 * ZCodeCard 整卡集成测试（D 缺口补全后新增）。
 *
 * 与 ZCodeCard.test.tsx 的关系：那个是单元测试（ZCodeHero + ZCodeSidePanel 独立测），
 * 本文件测整张 ZCodeCard 组合（GlassSurface + CardHeader + Grid + 底部 tray + CardFooter）。
 *
 * 历史背景：§10.4 / §10.5 时 CardHeader 用 `@/stores` 别名，tsx loader 在 node:test 下不解析
 * tsconfig paths（esbuild transform 模式限制），无法测整卡。§10.9 把 7 处 `@/` 改为相对路径
 * 后，整卡可测。本文件验证整卡组合契约。
 *
 * 整卡覆盖（visual-spec §5 ZCode 矩阵）：
 * - LocalData：CardHeader + Hero（700K）+ SidePanel（392.8M / GLM-4.6V）+ 底部 tray 2 列 + Footer
 * - NoData：Hero `—` + SidePanel "服务未提供"
 *
 * 整卡特有契约（单元测不到）：
 * - GlassSurface surface="card" 用 cardZCode 尺寸（visibleHeight=317px）
 * - CardHeader 的 brand 是 "ZCODE · LOCAL"
 * - 底部 tray 含今日 + 本机累计 2 列
 * - CardFooter 含 updatedAt 时间
 */

import "./jsdom-setup";
import { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import test from "node:test";
import assert from "node:assert/strict";

import "../../../renderer/src/i18n";
import i18n from "i18next";
import { ZCodeCardInner } from "../../../renderer/src/components/card/ZCodeCard";
import { toUsageViewModel } from "../../../renderer/src/domain/usage-view-model";
import { zcodeLocalData, zcodeNoData } from "../../../renderer/src/domain/fixtures/snapshots";

afterEach(cleanup);

const NOW = () => new Date("2026-07-18T08:01:00.000Z");

function renderZCodeCard(snapshot: typeof zcodeLocalData): {
  container: HTMLElement;
} {
  const vm = toUsageViewModel({
    snapshot,
    error: null,
    activeClientId: "zcode",
    now: NOW,
  });
  assert.equal(vm.client?.kind, "zcode");
  const { container } = render(<ZCodeCardInner vm={vm} onClose={() => undefined} />);
  return { container };
}

// ---------- LocalData 整卡 ----------

test("ZCodeCard LocalData 整卡: surface height = cardZCode.visibleHeight (317px)", () => {
  i18n.changeLanguage("zh-CN");
  const { container } = renderZCodeCard(zcodeLocalData);
  const surface = container.firstElementChild as HTMLElement;
  assert.ok(surface);
  assert.equal(surface.style.height, "317px", "ZCode Card visibleHeight = 317");
});

test("ZCodeCard LocalData 整卡: CardHeader 显示 ZCODE · LOCAL 品牌", () => {
  i18n.changeLanguage("zh-CN");
  renderZCodeCard(zcodeLocalData);
  assert.ok(screen.getAllByText("ZCODE · LOCAL").length > 0);
});

test("ZCodeCard LocalData 整卡: 同时显示 Hero 今日 + SidePanel 累计 + 模型", () => {
  i18n.changeLanguage("zh-CN");
  renderZCodeCard(zcodeLocalData);
  // Hero
  assert.ok(screen.getAllByText("700K").length > 0, "Hero 今日 700K");
  // SidePanel
  assert.ok(screen.getAllByText("392.8M").length > 0, "SidePanel 累计 392.8M");
  assert.ok(screen.getAllByText("GLM-4.6V").length > 0, "SidePanel 模型 GLM-4.6V");
});

test("ZCodeCard LocalData 整卡: 底部 tray 含今日 + 本机累计 2 列 caption", () => {
  i18n.changeLanguage("zh-CN");
  renderZCodeCard(zcodeLocalData);
  // tray.today / tray.lifetime caption 至少各出现一次（Hero caption 也是"今日"，
  // 但底部 tray 一定有今日 + 本机累计两个 caption）
  assert.ok(screen.getAllByText("今日").length >= 1);
  assert.ok(screen.getAllByText("本机累计").length >= 1);
});

test("ZCodeCard LocalData 整卡: CardFooter 含 updatedAt 占位（HH:mm 或 —）", () => {
  i18n.changeLanguage("zh-CN");
  const { container } = renderZCodeCard(zcodeLocalData);
  // CardFooter 渲染 "更新于 HH:mm" 文本。fixture fetchedAt = 2026-07-18T08:00:00Z。
  // 本地时区转 HH:mm 因 tz 而异，但 "更新于" prefix 是稳定的。
  const footerText = Array.from(container.querySelectorAll("span"))
    .map((el) => el.textContent ?? "")
    .find((t) => t.includes("更新于"));
  assert.ok(footerText, "CardFooter 应含 '更新于 ...'");
});

// ---------- NoData 整卡 ----------

test("ZCodeCard NoData 整卡: Hero 显示 —，SidePanel 显示服务未提供", () => {
  i18n.changeLanguage("zh-CN");
  renderZCodeCard(zcodeNoData);
  assert.ok(screen.getAllByText("—").length > 0, "Hero 今日占位 —");
  assert.ok(screen.getAllByText("服务未提供").length > 0, "SidePanel 显示服务未提供");
});

test("ZCodeCard NoData 整卡: CardHeader 仍显示 ZCODE · LOCAL（header 不受数据缺失影响）", () => {
  i18n.changeLanguage("zh-CN");
  renderZCodeCard(zcodeNoData);
  assert.ok(screen.getAllByText("ZCODE · LOCAL").length > 0);
});

// ---------- 整卡红线守护 ----------

test("ZCodeCard 整卡红线: LocalData DOM 不含 0% / 100% / 配额 label", () => {
  i18n.changeLanguage("zh-CN");
  const { container } = renderZCodeCard(zcodeLocalData);
  // 查 visible text 不含配额 label
  assert.equal(screen.queryByText("5 小时剩余"), null);
  assert.equal(screen.queryByText("每周剩余"), null);
  assert.equal(
    screen.queryByText("配额 — 服务未提供"),
    null,
    "ZCode LocalData 不应显示 Codex NoQuota 文案",
  );
  // 不应有 N% 形式数字
  const percentSpans = Array.from(container.querySelectorAll("span")).filter((el) =>
    /^\d+(\.\d+)?%$/.test(el.textContent ?? ""),
  );
  assert.equal(percentSpans.length, 0, "ZCodeCard 永不显示 N% 配额数字");
});
