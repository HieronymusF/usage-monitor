import React from "react";
/**
 * IndicatorBar — 600×44 横向浮窗（visual-spec §6）。
 *
 * Codex 4 段 + 2 按钮：
 *   Codex | 5H — | 周 64% ● | 今日 23.8M | 每周 6天13小时后     [theme][close]
 * ZCode 4 段 + 2 按钮：
 *   ZCode | 今日 23.8M | 累计 392.8M | 模型 GLM-4.6V | 本机估算  [theme][close]
 *
 * visual-spec §6 规则：
 * - 所有 Run 用 14/20。
 * - 品牌+值 SemiBold；标签+分隔符 Regular。
 * - 不允许多字号 TextBlock 各自垂直居中（统一 lineHeight 20）。
 * - 两个 30×30 按钮与文本容器共享同一垂直中心线。
 *
 * 红线（AGENTS.md）：
 * - Codex NoQuota：5H 段显示 "—"，不显示 0%/100%/估算值
 * - ZCode 永不显示配额百分比、圆环、健康度（除占位 "服务未提供"）
 *
 * Design System：Bar 用 GlassSurface surface="bar"（radius.bar=9）。
 * typography 逐字段引用 + lineHeight 显式 px（L1）。
 */

import { useTranslation } from "react-i18next";
import { Moon, Sun, X } from "lucide-react";
import type { UsageViewModel, ClientUsageViewModel } from "../../domain/types";
import { formatToken } from "../../domain/format-token";
import { computeCountdownParts, formatCountdown } from "../../domain/format-countdown";
import { GlassSurface } from "../foundations/GlassSurface";
import { IconButton } from "../foundations/IconButton";
import { useThemeStore } from "../../stores/themeStore";
import { useUsageViewModel } from "../../hooks/useUsageViewModel";
import { typography } from "../../styles/tokens";

/** Bar 文字统一 14/20（visual-spec §6）。 */
const BAR_FONT_SIZE = typography.bar.fontSize;
const BAR_LINE_HEIGHT = typography.bar.lineHeight;
/** 分隔符 · 颜色比标签更弱。 */
const SEPARATOR_COLOR = "var(--c-border)";
const DIVIDER = "·";

export function IndicatorBar(): React.ReactElement {
  const vm = useUsageViewModel();
  return <IndicatorBarInner vm={vm} onClose={() => window.close()} />;
}

export interface IndicatorBarInnerProps {
  vm: UsageViewModel;
  onClose: () => void;
}

export function IndicatorBarInner({ vm, onClose }: IndicatorBarInnerProps): React.ReactElement {
  const { t } = useTranslation();

  // loading / offline：占位
  if (vm.dataState === "loading" || vm.dataState === "offline" || vm.client === null) {
    return (
      <BarShell onClose={onClose}>
        <span style={valueStyle()}>
          {vm.dataState === "offline" ? t("footer.offline") : t("footer.loading")}
        </span>
      </BarShell>
    );
  }

  const client = vm.client;
  return (
    <BarShell onClose={onClose}>
      {client.kind === "zcode" ? (
        <ZCodeSegments client={client} />
      ) : (
        <CodexSegments client={client} />
      )}
    </BarShell>
  );
}

/** Bar 外壳：GlassSurface + 横排 + 2 按钮。所有内容共享垂直中心线。 */
function BarShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const setThemePreference = useThemeStore((s) => s.setPreference);
  const toggleTheme = (): void => {
    setThemePreference(resolvedTheme === "dark" ? "light" : "dark");
  };
  return (
    <GlassSurface
      surface="bar"
      style={{
        width: "600px",
        height: "44px",
        padding: "0 14px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: "14px",
          height: "100%",
        }}
      >
        {children}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <IconButton size="bar" aria-label={t("action.switchTheme")} onClick={toggleTheme}>
          {resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </IconButton>
        <IconButton size="bar" aria-label={t("action.close")} onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
    </GlassSurface>
  );
}

// ---------- Codex 4 段 ----------

function CodexSegments({ client }: { client: ClientUsageViewModel }): React.ReactElement {
  const { t, i18n } = useTranslation();
  const primary = client.primaryQuota;
  const secondary = client.secondaryQuota;
  const today = client.tokenUsage.today;
  const todayText = today !== null ? (formatToken(today) ?? "—") : "—";

  // primary = 5h（Dual / FiveOnly），周可用时 primary = weekly（WeeklyOnly）。
  // visual-spec §6 示例：5H 段 + 周段。WeeklyOnly 状态没有 5h，5H 段显示 —。
  const fiveHourQuota =
    primary?.kind === "five-hour" ? primary : secondary?.kind === "five-hour" ? secondary : null;
  const weeklyQuota =
    primary?.kind === "weekly" ? primary : secondary?.kind === "weekly" ? secondary : null;

  const fiveHourText = fiveHourQuota?.remainingPercent ?? null;
  const fiveHourDisplay = fiveHourText === null ? "—" : String(Math.round(fiveHourText)) + "%";
  const weeklyText = weeklyQuota?.remainingPercent ?? null;
  const weeklyDisplay = weeklyText === null ? null : String(Math.round(weeklyText)) + "%";

  // 倒计时用 primary 的 resetsAt（5h 优先，否则 weekly）。
  const countdownQuota = fiveHourQuota ?? weeklyQuota;
  const countdown = countdownQuota?.resetsAt
    ? formatCountdown(
        computeCountdownParts({ resetsAt: countdownQuota.resetsAt, now: () => new Date() }),
        i18n.language,
      )
    : null;

  return (
    <>
      <span style={brandStyle()}>{t("brand.codexShort")}</span>
      <Separator />
      {/* 5H 段 */}
      <span style={segmentStyle()}>
        <span style={labelStyle()}>{t("bar.fiveHourShort")}</span>
        <span style={valueStyle()}>{fiveHourDisplay}</span>
      </span>
      <Separator />
      {/* 周段：百分比 + 状态色点（visual-spec 示例 "周 64% ●"） */}
      <span style={segmentStyle()}>
        <span style={labelStyle()}>{t("bar.weeklyShort")}</span>
        {weeklyDisplay !== null ? (
          <>
            <span style={valueStyle()}>{weeklyDisplay}</span>
            <StatusDot health={weeklyQuota?.health ?? "unavailable"} />
          </>
        ) : (
          <span style={valueStyle()}>—</span>
        )}
      </span>
      <Separator />
      {/* 今日段 */}
      <span style={segmentStyle()}>
        <span style={labelStyle()}>{t("tray.today")}</span>
        <span style={valueStyle()}>{todayText}</span>
      </span>
      <Separator />
      {/* 倒计时段（无 label，纯值） */}
      <span style={valueStyle({ color: "var(--c-tertiary)" })}>{countdown ?? "—"}</span>
    </>
  );
}

// ---------- ZCode 4 段 ----------

function ZCodeSegments({ client }: { client: ClientUsageViewModel }): React.ReactElement {
  const { t } = useTranslation();
  const today = client.tokenUsage.today;
  const lifetime = client.tokenUsage.lifetimeTotal;
  const modelName = client.tokenUsage.models[0]?.name ?? "—";
  const todayText = today !== null ? (formatToken(today) ?? "—") : "—";
  const lifetimeText = lifetime !== null ? (formatToken(lifetime) ?? "—") : "—";

  return (
    <>
      <span style={brandStyle()}>{t("brand.zcodeShort")}</span>
      <Separator />
      <span style={segmentStyle()}>
        <span style={labelStyle()}>{t("tray.today")}</span>
        <span style={valueStyle()}>{todayText}</span>
      </span>
      <Separator />
      <span style={segmentStyle()}>
        <span style={labelStyle()}>{t("tray.lifetime")}</span>
        <span style={valueStyle()}>{lifetimeText}</span>
      </span>
      <Separator />
      <span style={segmentStyle()}>
        <span style={labelStyle()}>{t("tray.models")}</span>
        <span style={valueStyle()}>{modelName}</span>
      </span>
      <Separator />
      <span style={labelStyle({ color: "var(--c-tertiary)" })}>{t("bar.localEstimate")}</span>
    </>
  );
}

// ---------- 局部组件 + 样式工厂 ----------

function Separator(): React.ReactElement {
  return <span style={{ color: SEPARATOR_COLOR, fontSize: `${BAR_FONT_SIZE}px` }}>{DIVIDER}</span>;
}

/** 健康度色点（mirror StatusLabel 颜色映射，但 Bar 用更小的点）。 */
function StatusDot({
  health,
}: {
  health: "sufficient" | "low" | "critical" | "unavailable";
}): React.ReactElement {
  const colorMap = {
    sufficient: "var(--c-success)",
    low: "var(--c-warning)",
    critical: "var(--c-danger)",
    unavailable: "var(--c-tertiary)",
  } as const;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: colorMap[health],
        marginLeft: "4px",
        flexShrink: 0,
      }}
    />
  );
}

function brandStyle(): React.CSSProperties {
  return {
    fontFamily: typography.bar.fontFamily,
    fontSize: `${BAR_FONT_SIZE}px`,
    lineHeight: `${BAR_LINE_HEIGHT}px`,
    fontWeight: 600,
    color: "var(--c-ink)",
    whiteSpace: "nowrap",
  };
}

function segmentStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    whiteSpace: "nowrap",
  };
}

function labelStyle(overrides?: React.CSSProperties): React.CSSProperties {
  return {
    fontFamily: typography.bar.fontFamily,
    fontSize: `${BAR_FONT_SIZE}px`,
    lineHeight: `${BAR_LINE_HEIGHT}px`,
    fontWeight: 400,
    color: "var(--c-tertiary)",
    ...overrides,
  };
}

function valueStyle(overrides?: React.CSSProperties): React.CSSProperties {
  return {
    fontFamily: typography.bar.fontFamily,
    fontSize: `${BAR_FONT_SIZE}px`,
    lineHeight: `${BAR_LINE_HEIGHT}px`,
    fontWeight: 600,
    color: "var(--c-ink)",
    fontVariantNumeric: "tabular-nums lining-nums",
    ...overrides,
  };
}
