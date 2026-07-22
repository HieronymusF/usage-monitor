/**
 * usage-view-model 集成测试。
 *
 * 这是 Milestone A 的核心验收：确认 domain 层能把全部 fixture 正确转换为
 * UsageViewModel，覆盖 visual-spec §5 和 HANDOFF §11 的状态矩阵。
 *
 * 关键：UsageViewModel 现在始终非 null，loading/offline 时 client=null，
 * 由 dataState 区分两种空状态。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  pickClientSnapshot,
  toClientKind,
  toClientUsageViewModel,
  toUsageViewModel,
  todayKey,
} from "../../renderer/src/domain/usage-view-model.ts";
import {
  codexDailyUnsorted,
  codexDual,
  codexFiveOnly,
  codexNoQuota,
  codexOnlyUnknownWindows,
  codexRemaining0,
  codexRemaining100,
  codexRemaining19,
  codexRemaining20,
  codexRemaining49,
  codexRemaining50,
  codexTodayMissing,
  codexWeeklyOnly,
  codexWithUnknownWindows,
  FIXED_NOW,
  partialSnapshot,
  staleSnapshot,
  staleWarningSnapshot,
  zcodeLocalData,
  zcodeNoData,
  zcodeWithBogusLimits,
} from "../../renderer/src/domain/fixtures/snapshots.ts";

const NOW = FIXED_NOW; // 2026-07-18T08:01:00Z，todayKey 命中 "2026-07-18"

// ---------- toClientKind ----------

test("toClientKind: codex → codex", () => {
  assert.equal(toClientKind("codex"), "codex");
});

test("toClientKind: zcode → zcode", () => {
  assert.equal(toClientKind("zcode"), "zcode");
});

test("toClientKind: 未知 clientId → 回退 codex（防御）", () => {
  assert.equal(toClientKind("unknown"), "codex");
});

// ---------- todayKey（本地自然日，对齐 server/sessionLogReader.ts 的 bucket key）----------
//
// 复验场景（2026-07-18）：renderer 必须用本地自然日，否则 UTC+8 凌晨会显示"昨日"。
// 测试通过显式 timeZone 保证确定性，不依赖 process.env.TZ。

test("todayKey: 默认（系统时区）可调用且格式正确", () => {
  // 不强制断言具体值（依赖 process.env.TZ），只验证格式
  assert.match(todayKey(NOW), /^\d{4}-\d{2}-\d{2}$/);
});

test("todayKey: UTC 时区下 2026-07-18T08:01Z = '2026-07-18'", () => {
  assert.equal(todayKey(NOW, "UTC"), "2026-07-18");
});

test("todayKey: 跨本地午夜正确切换（UTC 时区对照）", () => {
  const lateEvening = () => new Date("2026-07-18T23:59:00.000Z");
  assert.equal(todayKey(lateEvening, "UTC"), "2026-07-18");
  const nextDay = () => new Date("2026-07-19T00:01:00.000Z");
  assert.equal(todayKey(nextDay, "UTC"), "2026-07-19");
});

test("todayKey: UTC+8 凌晨 00:30 本地 → 当地当日（不是 UTC 昨天）", () => {
  // 复验核心场景：renderer 在 Asia/Hong_Kong 的 2026-07-18T00:30:00+08:00
  // = 2026-07-17T16:30:00Z，UTC 切片会得到 "2026-07-17"（昨天）
  const hkMidnight = () => new Date("2026-07-17T16:30:00.000Z");
  assert.equal(todayKey(hkMidnight, "Asia/Hong_Kong"), "2026-07-18");
  // 对照：UTC 时区同时刻是 07-17
  assert.equal(todayKey(hkMidnight, "UTC"), "2026-07-17");
});

test("todayKey: UTC+8 早 08:00 本地（= UTC 00:00）两侧都同日", () => {
  // UTC 00:00 = UTC+8 08:00，边界点两侧都是同一日历日
  const boundary = () => new Date("2026-07-18T00:00:00.000Z");
  assert.equal(todayKey(boundary, "UTC"), "2026-07-18");
  assert.equal(todayKey(boundary, "Asia/Hong_Kong"), "2026-07-18");
});

test("todayKey: UTC+8 与 server bucket key 严格一致（契约对齐）", () => {
  // 这是契约统一的核心：renderer 查询的 todayKey 必须等于 server 写入的 bucket key
  // server 端用 CodexSessionLogReader({timeZone}) 写 bucket，
  // renderer 端用 todayKey(now, timeZone) 查询，两者用同一 server/time.ts 实现。
  // 详细跨进程验证在 tests/sessionLogReaderTimezone.test.js
  const hkNow = () => new Date("2026-07-17T16:15:00.000Z"); // = 2026-07-18T00:15+08:00
  assert.equal(todayKey(hkNow, "Asia/Hong_Kong"), "2026-07-18");
});

// ---------- Codex Dual ----------

test("Codex Dual: quotaState=dual, primary=5h, secondary=weekly, health=low", () => {
  const vm = toClientUsageViewModel(codexDual.clients.codex!, NOW);
  assert.equal(vm.kind, "codex");
  assert.equal(vm.quotaState, "dual");
  assert.equal(vm.primaryQuota?.kind, "five-hour");
  assert.equal(vm.primaryQuota?.remainingPercent, 42);
  assert.equal(vm.primaryQuota?.health, "low");
  assert.equal(vm.secondaryQuota?.kind, "weekly");
  assert.equal(vm.secondaryQuota?.remainingPercent, 64);
  assert.equal(vm.secondaryQuota?.health, "sufficient");
  assert.equal(vm.health, "low"); // 取主配额的健康度
  assert.equal(vm.planType, "plus");
  assert.equal(vm.billingMode, "subscription");
  assert.equal(vm.extraQuotaWindows.length, 0);
});

test("Codex Dual: token usage 正确提取", () => {
  const vm = toClientUsageViewModel(codexDual.clients.codex!, NOW);
  assert.equal(vm.tokenUsage.currentTask, 1_650_000);
  assert.equal(vm.tokenUsage.today, 1_650_000); // daily 里有 "2026-07-18" bucket
  assert.equal(vm.tokenUsage.lifetimeTotal, 125_000_000);
  assert.equal(vm.tokenUsage.quality, "official");
});

// ---------- Codex WeeklyOnly ----------

test("Codex WeeklyOnly: quotaState=weekly-only, primary=weekly, secondary=null", () => {
  const vm = toClientUsageViewModel(codexWeeklyOnly.clients.codex!, NOW);
  assert.equal(vm.quotaState, "weekly-only");
  assert.equal(vm.primaryQuota?.kind, "weekly");
  assert.equal(vm.secondaryQuota, null);
});

// ---------- Codex FiveOnly ----------

test("Codex FiveOnly: quotaState=five-only, primary=5h, secondary=null", () => {
  const vm = toClientUsageViewModel(codexFiveOnly.clients.codex!, NOW);
  assert.equal(vm.quotaState, "five-only");
  assert.equal(vm.primaryQuota?.kind, "five-hour");
  assert.equal(vm.secondaryQuota, null);
});

// ---------- Codex NoQuota ----------

test("Codex NoQuota: quotaState=unavailable, primary=null, health=unavailable", () => {
  const vm = toClientUsageViewModel(codexNoQuota.clients.codex!, NOW);
  assert.equal(vm.quotaState, "unavailable");
  assert.equal(vm.primaryQuota, null);
  assert.equal(vm.secondaryQuota, null);
  assert.equal(vm.health, "unavailable");
  // 但 token 数据仍在
  assert.equal(vm.tokenUsage.today, 700_000);
  assert.equal(vm.tokenUsage.quality, "local_estimate");
  // warnings 含 METHOD_NOT_SUPPORTED
  assert.ok(
    vm.warnings.some((w) => w.code === "METHOD_NOT_SUPPORTED"),
    "应保留 METHOD_NOT_SUPPORTED warning",
  );
});

// ---------- ZCode LocalData ----------

test("ZCode LocalData: quotaState=unavailable（ZCode 永远无配额）", () => {
  const vm = toClientUsageViewModel(zcodeLocalData.clients.zcode!, NOW);
  assert.equal(vm.kind, "zcode");
  assert.equal(vm.quotaState, "unavailable");
  assert.equal(vm.primaryQuota, null);
  assert.equal(vm.secondaryQuota, null);
  assert.equal(vm.extraQuotaWindows.length, 0);
  assert.equal(vm.health, "unavailable");
  assert.equal(vm.tokenUsage.today, 700_000);
  assert.equal(vm.tokenUsage.lifetimeTotal, 392_800_000);
  assert.equal(vm.tokenUsage.quality, "local_estimate");
  // models 保留
  assert.equal(vm.tokenUsage.models.length, 1);
  assert.equal(vm.tokenUsage.models[0]?.name, "GLM-4.6V");
});

// ---------- ZCode NoData ----------

test("ZCode NoData: available=false, 所有 token 字段 null", () => {
  const vm = toClientUsageViewModel(zcodeNoData.clients.zcode!, NOW);
  assert.equal(vm.available, false);
  assert.equal(vm.tokenUsage.today, null);
  assert.equal(vm.tokenUsage.currentTask, null);
  assert.equal(vm.tokenUsage.lifetimeTotal, null);
  assert.equal(vm.tokenUsage.quality, "unavailable");
});

// ---------- 红线：ZCode 即使输入了 limits 也必须清空 ----------

test("红线: ZCode 输入异常 limits 时必须无条件清空 primary/secondary/extra", () => {
  // zcodeWithBogusLimits 的 snapshot.limits 含一个 5h 窗口，理论上 ZcodeSource 不该这么填，
  // 但 domain 层必须防御性清空，绝不让 ZCode 显示出配额。
  const rawSnapshot = zcodeWithBogusLimits.clients.zcode!;
  assert.equal(rawSnapshot.limits.length, 1, "fixture 应该含 1 个 bogus limit（验证测试本身正确）");

  const vm = toClientUsageViewModel(rawSnapshot, NOW);
  assert.equal(vm.kind, "zcode");
  assert.equal(vm.quotaState, "unavailable");
  assert.equal(vm.primaryQuota, null, "primaryQuota 必须为 null（即使 limits 非空）");
  assert.equal(vm.secondaryQuota, null, "secondaryQuota 必须为 null");
  assert.equal(vm.extraQuotaWindows.length, 0, "extraQuotaWindows 必须为空数组");
  assert.equal(vm.health, "unavailable", "health 必须为 unavailable");
  // token 数据保留（清空的是配额，不是 token）
  assert.equal(vm.tokenUsage.today, 150_000);
});

// ---------- 未知 windowMinutes 窗口保留 ----------

test("未知窗口: 5h + 2 个 other → quotaState=five-only, extra 含 2 个 other", () => {
  const vm = toClientUsageViewModel(codexWithUnknownWindows.clients.codex!, NOW);
  assert.equal(vm.quotaState, "five-only");
  assert.equal(vm.primaryQuota?.kind, "five-hour");
  assert.equal(vm.secondaryQuota, null);
  assert.equal(vm.extraQuotaWindows.length, 2);
  // 验证 other 窗口的 label 保留（server 端 labelWindow 生成的值）
  const labels = vm.extraQuotaWindows.map((w) => w.label);
  assert.ok(labels.includes("1 天"));
  assert.ok(labels.includes("未标明窗口"));
});

test("未知窗口: 只有 other（无 5h/weekly）→ quotaState=unavailable, extra 仍保留", () => {
  const vm = toClientUsageViewModel(codexOnlyUnknownWindows.clients.codex!, NOW);
  assert.equal(vm.quotaState, "unavailable");
  assert.equal(vm.primaryQuota, null);
  assert.equal(vm.secondaryQuota, null);
  // 关键：extra 仍保留，不丢未知窗口
  assert.equal(vm.extraQuotaWindows.length, 1);
  assert.equal(vm.extraQuotaWindows[0]?.kind, "other");
  assert.equal(vm.extraQuotaWindows[0]?.label, "1 天");
});

// ---------- 今日 Token 按 UTC 日期匹配 ----------

test("今日 Token: daily 含今日 bucket → 正确返回今日 tokens", () => {
  const vm = toClientUsageViewModel(codexDual.clients.codex!, NOW);
  assert.equal(vm.tokenUsage.today, 1_650_000);
});

test("今日 Token: daily 只有昨日 bucket → today=null（不回退到最后一条）", () => {
  const vm = toClientUsageViewModel(codexTodayMissing.clients.codex!, NOW);
  assert.equal(vm.tokenUsage.today, null, "today 必须为 null，不能把昨日的 9_999_999 当成今日");
});

test("今日 Token: daily 顺序打乱（今日在前）→ 仍按日期匹配，不取最后一条", () => {
  const vm = toClientUsageViewModel(codexDailyUnsorted.clients.codex!, NOW);
  // daily 是 [今日 150_000, 昨日 888_888]，旧的"取最后一条"逻辑会返回 888_888
  assert.equal(vm.tokenUsage.today, 150_000, "必须按 UTC 日期匹配，不取数组最后一条");
});

// ---------- 健康度边界 ----------

test("健康度边界: remaining=0 → critical", () => {
  const vm = toClientUsageViewModel(codexRemaining0.clients.codex!, NOW);
  assert.equal(vm.primaryQuota?.health, "critical");
  assert.equal(vm.primaryQuota?.remainingPercent, 0);
});

test("健康度边界: remaining=19 → critical", () => {
  const vm = toClientUsageViewModel(codexRemaining19.clients.codex!, NOW);
  assert.equal(vm.primaryQuota?.health, "critical");
});

test("健康度边界: remaining=20 → low（含等号下界）", () => {
  const vm = toClientUsageViewModel(codexRemaining20.clients.codex!, NOW);
  assert.equal(vm.primaryQuota?.health, "low");
});

test("健康度边界: remaining=49 → low", () => {
  const vm = toClientUsageViewModel(codexRemaining49.clients.codex!, NOW);
  assert.equal(vm.primaryQuota?.health, "low");
});

test("健康度边界: remaining=50 → sufficient（含等号下界）", () => {
  const vm = toClientUsageViewModel(codexRemaining50.clients.codex!, NOW);
  assert.equal(vm.primaryQuota?.health, "sufficient");
});

test("健康度边界: remaining=100 → sufficient", () => {
  const vm = toClientUsageViewModel(codexRemaining100.clients.codex!, NOW);
  assert.equal(vm.primaryQuota?.health, "sufficient");
  assert.equal(vm.primaryQuota?.remainingPercent, 100);
});

// ---------- pickClientSnapshot 回退 ----------

test("pickClientSnapshot: 精确匹配 activeClient", () => {
  const snapshot = pickClientSnapshot(codexDual, "codex");
  assert.equal(snapshot.clientId, "codex");
});

test("pickClientSnapshot: 未知 activeClient → 回退 codex", () => {
  const snapshot = pickClientSnapshot(codexDual, "nonexistent");
  assert.equal(snapshot.clientId, "codex");
});

test("pickClientSnapshot: codex 不存在时回退 zcode", () => {
  const snapshot = pickClientSnapshot(zcodeLocalData, "codex");
  assert.equal(snapshot.clientId, "zcode");
});

// ---------- toUsageViewModel 集成（含 dataState + loading/offline 不返回 null）----------

test("toUsageViewModel: null snapshot + 无错误 → dataState=loading, client=null（不返回 null）", () => {
  const vm = toUsageViewModel({ snapshot: null, error: null, activeClientId: "codex", now: NOW });
  assert.equal(vm.dataState, "loading");
  assert.equal(vm.client, null);
  assert.equal(vm.fetchedAt, "");
  assert.deepEqual(vm.warnings, []);
});

test("toUsageViewModel: null snapshot + 有错误 → dataState=offline, client=null", () => {
  const vm = toUsageViewModel({
    snapshot: null,
    error: new Error("bridge down"),
    activeClientId: "codex",
    now: NOW,
  });
  assert.equal(vm.dataState, "offline");
  assert.equal(vm.client, null);
});

test("toUsageViewModel: Codex Dual + fresh → dataState=fresh, client 有值", () => {
  const vm = toUsageViewModel({
    snapshot: codexDual,
    error: null,
    activeClientId: "codex",
    now: NOW,
  });
  assert.equal(vm.dataState, "fresh");
  assert.notEqual(vm.client, null);
  assert.equal(vm.client?.kind, "codex");
  assert.equal(vm.client?.quotaState, "dual");
});

test("toUsageViewModel: staleAfter 过期 → dataState=stale", () => {
  const vm = toUsageViewModel({
    snapshot: staleSnapshot,
    error: null,
    activeClientId: "codex",
    now: NOW,
  });
  assert.equal(vm.dataState, "stale");
});

test("toUsageViewModel: STALE warning → dataState=stale", () => {
  const vm = toUsageViewModel({
    snapshot: staleWarningSnapshot,
    error: null,
    activeClientId: "codex",
    now: NOW,
  });
  assert.equal(vm.dataState, "stale");
});

test("toUsageViewModel: partial snapshot → dataState=partial", () => {
  const vm = toUsageViewModel({
    snapshot: partialSnapshot,
    error: null,
    activeClientId: "codex",
    now: NOW,
  });
  assert.equal(vm.dataState, "partial");
});

test("toUsageViewModel: 刷新错误 → dataState=refresh-error, client 仍有值", () => {
  const vm = toUsageViewModel({
    snapshot: codexDual,
    error: new Error("refresh failed"),
    activeClientId: "codex",
    now: NOW,
  });
  assert.equal(vm.dataState, "refresh-error");
  assert.notEqual(vm.client, null); // 保留上次快照
});

test("toUsageViewModel: 切换到 ZCode client（activeClientId=zcode）", () => {
  const vm = toUsageViewModel({
    snapshot: codexDual, // 包含 zcode 子快照
    error: null,
    activeClientId: "zcode",
    now: NOW,
  });
  assert.equal(vm.client?.kind, "zcode");
  assert.equal(vm.client?.quotaState, "unavailable");
});

// ---------- 红线总验证 ----------

test("红线: ZCode 永远不显示配额百分比（全部 ZCode fixture）", () => {
  for (const fixture of [zcodeLocalData, zcodeNoData, zcodeWithBogusLimits]) {
    const vm = toClientUsageViewModel(fixture.clients.zcode!, NOW);
    assert.equal(vm.quotaState, "unavailable");
    assert.equal(vm.primaryQuota, null);
    assert.equal(vm.secondaryQuota, null);
    assert.equal(vm.extraQuotaWindows.length, 0);
    assert.equal(vm.health, "unavailable");
  }
});

test("红线: Codex 配额缺失时不伪造 0%/100%", () => {
  const vm = toClientUsageViewModel(codexNoQuota.clients.codex!, NOW);
  assert.equal(vm.quotaState, "unavailable");
  assert.equal(vm.primaryQuota, null); // 不是 0% 也不是 100%，是 null
});

test("红线: 未知 windowMinutes 窗口不丢失（保留在 extra）", () => {
  for (const fixture of [codexWithUnknownWindows, codexOnlyUnknownWindows]) {
    const vm = toClientUsageViewModel(fixture.clients.codex!, NOW);
    // 原始 limits 数量 = primary(1或0) + secondary(0或0) + extra
    const originalCount = fixture.clients.codex!.limits.length;
    const reconstructed =
      (vm.primaryQuota ? 1 : 0) + (vm.secondaryQuota ? 1 : 0) + vm.extraQuotaWindows.length;
    assert.equal(
      reconstructed,
      originalCount,
      `窗口数量必须守恒：原始 ${originalCount}，重建 ${reconstructed}`,
    );
  }
});
