/**
 * SidePanel — Codex Card 右侧主区（根据 quotaState 切换）。
 *
 * visual-spec §5：
 * - Dual：Weekly Side Ring（126px）+ 重置倒计时
 * - WeeklyOnly：今日 Token（Display S 34/42 Bold）+ 本机聚合
 * - FiveOnly：`每周` + `服务未提供`（无 0% 圆环）
 *
 * 红线：FiveOnly 不画 0% 圆环（visual-spec §5 L205）。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import type { ClientUsageViewModel, QuotaState, QuotaWindowViewModel } from "../../../domain/types";
import { computeCountdownParts, formatCountdown } from "../../../domain/format-countdown";
import { formatToken } from "../../../domain/format-token";
import { StatusLabel } from "../../foundations/StatusLabel";
import { ringAngles, ringGeometry } from "../../../styles/tokens";

/**
 * Side ring 简版几何（ringGeometry.side，无 magic number）。
 *
 * 第 2 处简版 ring（第 1 处是 WeeklyHeroRing）。按 G3 / Ponytail YAGNI，
 * 不抽 SimpleRing 共享组件——前 2 处内联，等第 3 处真实复用（如 Orb / Capsule）再抽。
 *
 * 与 WeeklyHeroRing 同款：
 * - 2 个 circle（rail + progress），dasharray 控进度，rotate(-90) 起 12 点
 * - 无渐变 / 无 halo / 无刻度 / 无 OuterBorder / 无 InnerDisc / 无 StartKnob
 * - rail 用 --c-rail 浅灰蓝；progress 用 --c-accent-start 纯色品牌蓝
 * - 100% 留 ringAngles.fullCircleSafetyGap 安全缝
 */
const SIDE = ringGeometry.side;
const SIDE_CENTER = SIDE.frame / 2;
const SIDE_RADIUS = SIDE.diameter / 2;
const SIDE_CIRCUMFERENCE = 2 * Math.PI * SIDE_RADIUS;
const SIDE_FULL_CIRCLE_GAP_RATIO = ringAngles.fullCircleSafetyGap / 360;

function sideProgressToRatio(progress: number | null): number {
  if (progress === null || !Number.isFinite(progress)) return 0;
  const clamped = Math.min(100, Math.max(0, progress));
  if (clamped <= 0) return 0;
  if (clamped >= 100) return 1 - SIDE_FULL_CIRCLE_GAP_RATIO;
  return clamped / 100;
}

export interface SidePanelProps {
  quotaState: QuotaState;
  secondaryQuota: QuotaWindowViewModel | null;
  client: ClientUsageViewModel;
  now: () => Date;
}

export function SidePanel({
  quotaState,
  secondaryQuota,
  client,
  now,
}: SidePanelProps): React.ReactElement {
  if (quotaState === "dual") {
    return <WeeklySideRing quota={secondaryQuota} now={now} />;
  }
  if (quotaState === "weekly-only") {
    return <TodayTokenPanel client={client} />;
  }
  // five-only: 每周 + 服务未提供（不画 0% 圆环）
  if (quotaState === "five-only") {
    return <WeeklyUnavailablePanel />;
  }
  // unavailable (no-quota): 不显示右侧配额
  return <EmptyPanel />;
}

function WeeklySideRing({ quota, now }: { quota: QuotaWindowViewModel | null; now: () => Date }) {
  const { t, i18n } = useTranslation();
  const remaining = quota?.remainingPercent ?? null;
  const isUnavailable = remaining === null;
  const valueText = isUnavailable ? "—" : String(Math.round(remaining as number));
  const countdown = quota?.resetsAt
    ? formatCountdown(computeCountdownParts({ resetsAt: quota.resetsAt, now }), i18n.language)
    : null;

  const ratio = sideProgressToRatio(remaining);
  const progressDash = isUnavailable ? 0 : SIDE_CIRCUMFERENCE * ratio;
  const progressDasharray = String(progressDash) + " " + String(SIDE_CIRCUMFERENCE);
  const rotateTransform = "rotate(-90 " + SIDE_CENTER + " " + SIDE_CENTER + ")";
  const viewBoxValue = "0 0 " + SIDE.frame + " " + SIDE.frame;
  const health = quota?.health ?? "unavailable";
  const healthLabelKey = "health." + health;
  const framePx = SIDE.frame + "px";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        width: framePx,
      }}
    >
      <div
        style={{
          fontSize: "13px",
          lineHeight: "19px",
          color: "var(--c-tertiary)",
        }}
      >
        {t("quota.weekly")}
      </div>
      <div style={{ position: "relative", width: framePx, height: framePx, flexShrink: 0 }}>
        <svg
          width={SIDE.frame}
          height={SIDE.frame}
          viewBox={viewBoxValue}
          preserveAspectRatio="xMidYMid meet"
          aria-label={t("quota.weeklyRemaining")}
          role="img"
          style={{ display: "block" }}
        >
          <g transform={rotateTransform}>
            <circle
              cx={SIDE_CENTER}
              cy={SIDE_CENTER}
              r={SIDE_RADIUS}
              fill="none"
              stroke="var(--c-rail)"
              strokeWidth={SIDE.stroke}
              strokeLinecap="round"
              strokeDasharray={isUnavailable ? "4 4" : undefined}
            />
            {!isUnavailable && ratio > 0 ? (
              <circle
                cx={SIDE_CENTER}
                cy={SIDE_CENTER}
                r={SIDE_RADIUS}
                fill="none"
                stroke="var(--c-accent-start)"
                strokeWidth={SIDE.stroke}
                strokeLinecap="round"
                strokeDasharray={progressDasharray}
              />
            ) : null}
          </g>
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", color: "var(--c-ink)" }}>
            <span
              style={{
                fontFamily: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
                fontSize: "42px",
                lineHeight: "48px",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums lining-nums",
              }}
            >
              {valueText}
            </span>
            {!isUnavailable ? (
              <span style={{ fontSize: "22px", fontWeight: 600, marginLeft: "2px" }}>%</span>
            ) : null}
          </div>
          <StatusLabel status={health} label={t(healthLabelKey)} dotSize={5} />
        </div>
      </div>
      {countdown ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--c-tertiary)",
            fontSize: "13px",
          }}
        >
          <Clock size={12} aria-hidden="true" />
          <span>{countdown}</span>
        </div>
      ) : null}
    </div>
  );
}

function TodayTokenPanel({ client }: { client: ClientUsageViewModel }) {
  const { t } = useTranslation();
  const today = client.tokenUsage.today;
  const todayText = today !== null ? (formatToken(today) ?? "—") : "—";
  const lifetime = client.tokenUsage.lifetimeTotal;
  const lifetimeText = lifetime !== null ? (formatToken(lifetime) ?? "—") : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "160px" }}>
      <div>
        <div style={{ fontSize: "13px", lineHeight: "19px", color: "var(--c-tertiary)" }}>
          {t("tray.today")}
        </div>
        <div
          style={{
            fontFamily: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
            fontSize: "34px",
            lineHeight: "42px",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums lining-nums",
            color: "var(--c-ink)",
          }}
        >
          {todayText}
        </div>
      </div>
      <div>
        <div style={{ fontSize: "13px", lineHeight: "19px", color: "var(--c-tertiary)" }}>
          {t("tray.lifetime")}
        </div>
        <div
          style={{
            fontFamily: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
            fontSize: "22px",
            lineHeight: "28px",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums lining-nums",
            color: "var(--c-ink)",
          }}
        >
          {lifetimeText}
        </div>
      </div>
    </div>
  );
}

function WeeklyUnavailablePanel(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "126px" }}>
      <div style={{ fontSize: "13px", lineHeight: "19px", color: "var(--c-tertiary)" }}>
        {t("quota.weekly")}
      </div>
      <StatusLabel status="unavailable" label={t("health.unavailable")} dotSize={6} />
    </div>
  );
}

function EmptyPanel(): React.ReactElement {
  return <div style={{ width: "126px" }} />;
}
