/**
 * Fixtures — 覆盖全部状态矩阵的合成 MultiClientSnapshot。
 *
 * 用于：
 * 1. renderer domain 单元测试（tests/renderer/*.test.ts）
 * 2. 后续组件开发时的 mock 数据
 * 3. 视觉回归测试（Milestone C 起）
 *
 * 覆盖矩阵（visual-spec.md §5、HANDOFF.md §11）：
 * - Codex: Dual / WeeklyOnly / FiveOnly / NoQuota
 * - ZCode: LocalData / NoData
 * - 边界值: remainingPercent 0 / 19 / 20 / 49 / 50 / 100
 * - 未知 windowMinutes 窗口（"other"，server 端不丢弃）
 * - 跨日期 daily bucket（今日 UTC vs 昨日 UTC）
 * - STALE / SOURCE_REFRESH_FAILED warnings
 *
 * 不含真实凭据或真实 session 内容；tokens 是合成的任意数字。
 *
 * ⚠️ 这些是 fixture，不是真实数据。任何在 fixture 里的"百分比"都是
 * 为了测试分类器边界，不代表真实 Codex 配额。
 */

import type { MultiClientSnapshot } from "../../../../server/types.js";

/**
 * 基准时间：2026-07-18T08:00:00Z。
 * 这也是 daily bucket 里"今日"的 key（"2026-07-18"，UTC 日期）。
 * 测试用固定 now = 2026-07-18T08:01:00Z，让 todayKey() 命中 "2026-07-18"。
 */
export const BASE_TIME = "2026-07-18T08:00:00.000Z";
/** 基准时间 + 120s = stale 边界。测试 now=08:01 时为 fresh。 */
export const BASE_STALE_AFTER = "2026-07-18T08:02:00.000Z";

export function makeBaseSnapshot(
  clients: MultiClientSnapshot["clients"],
  warnings: MultiClientSnapshot["warnings"] = [],
): MultiClientSnapshot {
  return {
    schemaVersion: 2,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    clients,
    warnings,
  };
}

// 固定的 now，让 todayKey() 命中 "2026-07-18"，和 daily bucket 对齐。
export const FIXED_NOW = () => new Date("2026-07-18T08:01:00.000Z");

// ---------- Codex Dual（5h + weekly，最常见）----------

export const codexDual: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: "plus",
    billingMode: "subscription",
    limits: [
      {
        id: "primary-5h",
        label: "5 小时",
        windowMinutes: 300,
        usedPercent: 58,
        remainingPercent: 42,
        resetsAt: "2026-07-18T10:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
      {
        id: "secondary-weekly",
        label: "每周",
        windowMinutes: 10080,
        usedPercent: 36,
        remainingPercent: 64,
        resetsAt: "2026-07-22T08:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
    ],
    tokenUsage: {
      input: 1_200_000,
      cachedInput: 800_000,
      output: 400_000,
      reasoningOutput: 50_000,
      total: 1_650_000,
      lifetimeTotal: 125_000_000,
      daily: [
        { date: "2026-07-17", tokens: 3_200_000 },
        { date: "2026-07-18", tokens: 1_650_000 },
      ],
      source: "account_usage",
      quality: "official",
    },
    models: null,
    warnings: [],
  },
  zcode: {
    clientId: "zcode",
    displayName: "ZCode",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: null,
    billingMode: null,
    limits: [],
    tokenUsage: {
      input: 500_000,
      cachedInput: 300_000,
      output: 200_000,
      reasoningOutput: null,
      total: 700_000,
      lifetimeTotal: 392_800_000,
      daily: [{ date: "2026-07-18", tokens: 700_000 }],
      source: "local_session",
      quality: "local_estimate",
    },
    models: [{ name: "GLM-4.6V", input: 500_000, output: 200_000 }],
    warnings: [{ code: "LOCAL_ESTIMATE_ONLY", message: "ZCode 仅有本机估算数据" }],
  },
});

// ---------- Codex WeeklyOnly（只有周额度，5h 缺失）----------

export const codexWeeklyOnly: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: "plus",
    billingMode: "subscription",
    limits: [
      {
        id: "secondary-weekly",
        label: "每周",
        windowMinutes: 10080,
        usedPercent: 36,
        remainingPercent: 64,
        resetsAt: "2026-07-22T08:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
    ],
    tokenUsage: {
      input: 900_000,
      cachedInput: 600_000,
      output: 300_000,
      reasoningOutput: null,
      total: 1_200_000,
      lifetimeTotal: 100_000_000,
      daily: [{ date: "2026-07-18", tokens: 1_200_000 }],
      source: "account_usage",
      quality: "official",
    },
    models: null,
    warnings: [],
  },
});

// ---------- Codex FiveOnly（只有 5h，weekly 缺失）----------

export const codexFiveOnly: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: "plus",
    billingMode: "subscription",
    limits: [
      {
        id: "primary-5h",
        label: "5 小时",
        windowMinutes: 300,
        usedPercent: 58,
        remainingPercent: 42,
        resetsAt: "2026-07-18T10:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
    ],
    tokenUsage: {
      input: 1_200_000,
      cachedInput: 800_000,
      output: 400_000,
      reasoningOutput: null,
      total: 1_650_000,
      lifetimeTotal: 125_000_000,
      daily: [{ date: "2026-07-18", tokens: 1_650_000 }],
      source: "account_usage",
      quality: "official",
    },
    models: null,
    warnings: [],
  },
});

// ---------- Codex NoQuota（配额完全缺失，仍有 token 数据）----------

export const codexNoQuota: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: null,
    billingMode: null,
    limits: [],
    tokenUsage: {
      input: 500_000,
      cachedInput: 300_000,
      output: 200_000,
      reasoningOutput: null,
      total: 700_000,
      lifetimeTotal: 80_000_000,
      daily: [{ date: "2026-07-18", tokens: 700_000 }],
      source: "local_session",
      quality: "local_estimate",
    },
    models: null,
    warnings: [{ code: "METHOD_NOT_SUPPORTED", message: "app-server 不支持配额查询" }],
  },
});

// ---------- 健康度边界 fixture（独立命名，不再混用）----------
//
// 阈值（classify-health.ts）：>= 50 sufficient, 20-49 low, < 20 critical
// 测边界值: 0 / 19 / 20 / 49 / 50 / 100

function makeCodexBoundary(name: string, remainingPercent: number): MultiClientSnapshot {
  const usedPercent = 100 - remainingPercent;
  return makeBaseSnapshot({
    codex: {
      clientId: "codex",
      displayName: "Codex",
      available: true,
      fetchedAt: BASE_TIME,
      staleAfter: BASE_STALE_AFTER,
      planType: "plus",
      billingMode: "subscription",
      limits: [
        {
          id: `boundary-${name}`,
          label: "5 小时",
          windowMinutes: 300,
          usedPercent,
          remainingPercent,
          resetsAt: "2026-07-18T10:00:00.000Z",
          source: "app_server",
          quality: "official",
        },
      ],
      tokenUsage: {
        input: 1_000_000,
        cachedInput: 500_000,
        output: 500_000,
        reasoningOutput: null,
        total: 1_500_000,
        lifetimeTotal: 100_000_000,
        daily: [{ date: "2026-07-18", tokens: 1_500_000 }],
        source: "account_usage",
        quality: "official",
      },
      models: null,
      warnings: [],
    },
  });
}

/** remaining=0 → critical（耗尽）。 */
export const codexRemaining0 = makeCodexBoundary("remaining-0", 0);
/** remaining=19 → critical（刚低于 low 下界）。 */
export const codexRemaining19 = makeCodexBoundary("remaining-19", 19);
/** remaining=20 → low（low 区间含等号下界）。 */
export const codexRemaining20 = makeCodexBoundary("remaining-20", 20);
/** remaining=49 → low（刚低于 sufficient 下界）。 */
export const codexRemaining49 = makeCodexBoundary("remaining-49", 49);
/** remaining=50 → sufficient（sufficient 区间含等号下界）。 */
export const codexRemaining50 = makeCodexBoundary("remaining-50", 50);
/** remaining=100 → sufficient（全满）。 */
export const codexRemaining100 = makeCodexBoundary("remaining-100", 100);

// ---------- ZCode LocalData（有本机日志，无配额）----------

export const zcodeLocalData: MultiClientSnapshot = makeBaseSnapshot({
  zcode: {
    clientId: "zcode",
    displayName: "ZCode",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: null,
    billingMode: null,
    limits: [],
    tokenUsage: {
      input: 500_000,
      cachedInput: 300_000,
      output: 200_000,
      reasoningOutput: null,
      total: 700_000,
      lifetimeTotal: 392_800_000,
      daily: [{ date: "2026-07-18", tokens: 700_000 }],
      source: "local_session",
      quality: "local_estimate",
    },
    models: [{ name: "GLM-4.6V", input: 500_000, output: 200_000 }],
    warnings: [{ code: "LOCAL_ESTIMATE_ONLY", message: "ZCode 仅有本机估算数据" }],
  },
});

// ---------- ZCode NoData（本机无日志）----------

export const zcodeNoData: MultiClientSnapshot = makeBaseSnapshot({
  zcode: {
    clientId: "zcode",
    displayName: "ZCode",
    available: false,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: null,
    billingMode: null,
    limits: [],
    tokenUsage: {
      input: null,
      cachedInput: null,
      output: null,
      reasoningOutput: null,
      total: null,
      lifetimeTotal: null,
      daily: null,
      source: "none",
      quality: "unavailable",
    },
    models: null,
    warnings: [{ code: "ZCODE_NO_SESSIONS", message: "未找到 ZCode 会话日志" }],
  },
});

/**
 * ZCode 输入异常 limits（红线测试用）。
 * 模拟"ZcodeSource 被错误地填了 limits"——理论上不应发生，但 domain 层必须
 * 防御性清空，绝不让 ZCode 显示出配额窗口。
 */
export const zcodeWithBogusLimits: MultiClientSnapshot = makeBaseSnapshot({
  zcode: {
    clientId: "zcode",
    displayName: "ZCode",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: null,
    billingMode: null,
    limits: [
      {
        id: "bogus-5h",
        label: "5 小时",
        windowMinutes: 300,
        usedPercent: 50,
        remainingPercent: 50,
        resetsAt: "2026-07-18T10:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
    ],
    tokenUsage: {
      input: 100_000,
      cachedInput: 50_000,
      output: 50_000,
      reasoningOutput: null,
      total: 150_000,
      lifetimeTotal: 1_000_000,
      daily: [{ date: "2026-07-18", tokens: 150_000 }],
      source: "local_session",
      quality: "local_estimate",
    },
    models: null,
    warnings: [],
  },
});

// ---------- 未知 windowMinutes 窗口（"other"，server 不丢弃）----------
//
// 模拟 server/normalize.ts:33 的 labelWindow 对非 300/10080 分钟数的处理。
// 这些窗口必须保留并进 extraQuotaWindows，不能丢。

export const codexWithUnknownWindows: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: "plus",
    billingMode: "subscription",
    limits: [
      {
        id: "primary-5h",
        label: "5 小时",
        windowMinutes: 300,
        usedPercent: 40,
        remainingPercent: 60,
        resetsAt: "2026-07-18T10:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
      // 未知窗口 1：1 天（1440 分钟），labelWindow 返回 "1 天"
      {
        id: "daily-window",
        label: "1 天",
        windowMinutes: 1440,
        usedPercent: 30,
        remainingPercent: 70,
        resetsAt: "2026-07-19T08:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
      // 未知窗口 2：null 分钟，labelWindow 返回 "未标明窗口"
      {
        id: "unlabeled-window",
        label: "未标明窗口",
        windowMinutes: null,
        usedPercent: null,
        remainingPercent: null,
        resetsAt: null,
        source: "app_server",
        quality: "unavailable",
      },
    ],
    tokenUsage: {
      input: 500_000,
      cachedInput: 300_000,
      output: 200_000,
      reasoningOutput: null,
      total: 700_000,
      lifetimeTotal: 50_000_000,
      daily: [{ date: "2026-07-18", tokens: 700_000 }],
      source: "account_usage",
      quality: "official",
    },
    models: null,
    warnings: [],
  },
});

/** 只有未知窗口（无 5h/weekly）→ quotaState=unavailable，但 extra 仍保留。 */
export const codexOnlyUnknownWindows: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: "plus",
    billingMode: "subscription",
    limits: [
      {
        id: "daily-window",
        label: "1 天",
        windowMinutes: 1440,
        usedPercent: 30,
        remainingPercent: 70,
        resetsAt: "2026-07-19T08:00:00.000Z",
        source: "app_server",
        quality: "official",
      },
    ],
    tokenUsage: {
      input: 500_000,
      cachedInput: 300_000,
      output: 200_000,
      reasoningOutput: null,
      total: 700_000,
      lifetimeTotal: 50_000_000,
      daily: [{ date: "2026-07-18", tokens: 700_000 }],
      source: "account_usage",
      quality: "official",
    },
    models: null,
    warnings: [],
  },
});

// ---------- 跨日期 daily bucket（今日 UTC vs 昨日 UTC）----------
//
// 测试 extractTodayTokens 是否按 UTC 日期精确匹配。
// now=2026-07-18T08:01:00Z 时 todayKey="2026-07-18"。

/** daily 只有昨天的数据（今日 bucket 缺失）→ today 应为 null，不回退。 */
export const codexTodayMissing: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: "plus",
    billingMode: "subscription",
    limits: [],
    tokenUsage: {
      input: 500_000,
      cachedInput: 300_000,
      output: 200_000,
      reasoningOutput: null,
      total: 700_000,
      lifetimeTotal: 50_000_000,
      daily: [{ date: "2026-07-17", tokens: 9_999_999 }], // 只有昨天
      source: "account_usage",
      quality: "official",
    },
    models: null,
    warnings: [],
  },
});

/** daily 顺序打乱（今日在前，昨日在后）→ today 仍正确匹配，不取"最后一条"。 */
export const codexDailyUnsorted: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    clientId: "codex",
    displayName: "Codex",
    available: true,
    fetchedAt: BASE_TIME,
    staleAfter: BASE_STALE_AFTER,
    planType: "plus",
    billingMode: "subscription",
    limits: [],
    tokenUsage: {
      input: 100_000,
      cachedInput: 50_000,
      output: 50_000,
      reasoningOutput: null,
      total: 150_000,
      lifetimeTotal: 10_000_000,
      // 顺序故意倒过来：今日在前
      daily: [
        { date: "2026-07-18", tokens: 150_000 },
        { date: "2026-07-17", tokens: 888_888 },
      ],
      source: "account_usage",
      quality: "official",
    },
    models: null,
    warnings: [],
  },
});

// ---------- Data state fixtures ----------

/** Stale：把 staleAfter 改到过去，模拟过期。 */
export const staleSnapshot: MultiClientSnapshot = {
  ...codexDual,
  staleAfter: "2026-07-18T07:00:00.000Z", // 1 小时前
};

/** STALE warning（codexSource.ts withStaleState 单源级过期）。 */
export const staleWarningSnapshot: MultiClientSnapshot = makeBaseSnapshot({
  codex: {
    ...codexDual.clients.codex!,
    warnings: [{ code: "STALE", message: "数据已过期" }],
  },
});

/** Partial：某个 source 刷新失败但仍有数据。 */
export const partialSnapshot: MultiClientSnapshot = makeBaseSnapshot(
  {
    codex: {
      ...codexDual.clients.codex!,
      warnings: [],
    },
    zcode: {
      ...zcodeNoData.clients.zcode!,
      warnings: [{ code: "SOURCE_REFRESH_FAILED", message: "ZCode 源刷新失败" }],
    },
  },
  [{ code: "SOURCE_REFRESH_FAILED", message: "部分数据源刷新失败" }],
);

/** 所有 fixture 的索引，便于测试和组件 mock。 */
export const allFixtures = {
  codexDual,
  codexWeeklyOnly,
  codexFiveOnly,
  codexNoQuota,
  codexRemaining0,
  codexRemaining19,
  codexRemaining20,
  codexRemaining49,
  codexRemaining50,
  codexRemaining100,
  zcodeLocalData,
  zcodeNoData,
  zcodeWithBogusLimits,
  codexWithUnknownWindows,
  codexOnlyUnknownWindows,
  codexTodayMissing,
  codexDailyUnsorted,
  staleSnapshot,
  staleWarningSnapshot,
  partialSnapshot,
} as const;
