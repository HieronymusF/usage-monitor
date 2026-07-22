import React from "react";
/**
 * WeeklyHeroRing — Codex WeeklyOnly Hero（visual-spec §5 + 用户 2026-07-19 重写需求）。
 *
 * 左侧主区：标准环形进度条（rail + progress arc 两层）+ 中心数字栈。
 *
 * 与 ProgressRing 共享组件的差异（用户决策，仅本组件）：
 * - 不用 ProgressRing（共享 6 层结构：halo / border / rail / ticks / innerDisc / arc + startKnob）。
 * - 本组件用 2 个 circle + dasharray/dashoffset 实现"标准环形进度条"，原因：
 *   1. ProgressRing 起点叠加了 StartKnob + 圆头端点 + halo，导致起点视觉粗于终点（不对称）。
 *   2. 用户要求"无渐变 / 无发光 / 无刻度"，与 visual-spec §7 的 6 层结构冲突。
 * - 此重写只影响 WeeklyHeroRing（weekly-only 状态左侧 hero）。
 *   ProgressRing 共享组件不动（28 个几何测试继续守护 Orb/Side/Capsule/FiveHourHero）。
 * - 不再渲染刻度：用户决策（无明确业务含义）。
 *
 * 几何契约（visual-spec §7 + 用户需求）：
 * - 0% 起点 12 点方向，顺时针增长。
 * - stroke-linecap="round"，两端圆头，端点尺寸 = stroke 宽度（不超过）。
 * - 100% 留 1° 安全缝（避免两端圆头互盖）。
 * - rail 用 --c-rail（浅灰蓝），progress 用 --c-accent-start（清晰品牌蓝，纯色无渐变）。
 * - 所有尺寸用 ringGeometry.hero token，无散落 magic number。
 */

import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import type { Health, QuotaWindowViewModel } from "../../../domain/types";
import { computeCountdownParts, formatCountdown } from "../../../domain/format-countdown";
import { StatusLabel } from "../../foundations/StatusLabel";
import { ringAngles, ringGeometry } from "../../../styles/tokens";

const HEALTH_I18N: Record<Health, "sufficient" | "low" | "critical" | "unavailable"> = {
  sufficient: "sufficient",
  low: "low",
  critical: "critical",
  unavailable: "unavailable",
};

export interface WeeklyHeroRingProps {
  quota: QuotaWindowViewModel | null;
  now: () => Date;
}

/** 圆环几何 token（来自 ringGeometry.hero，无 magic number）。 */
const HERO = ringGeometry.hero;
/** rail + progress 共用的圆心 = frame 中心。 */
const CENTER = HERO.frame / 2;
/** circle 的 r 参数 = diameter / 2（描边中心线）。 */
const RADIUS = HERO.diameter / 2;
/** 圆周长，用于 dasharray。 */
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 100% 时留的安全缝对应的不画比例（1°/360°）。避免两端圆头互盖。 */
const FULL_CIRCLE_GAP_RATIO = ringAngles.fullCircleSafetyGap / 360;

/**
 * 把 progress (0-100) 转成 progress circle 应画的弧长比例（0-1）。
 * 100% 时 = 1 - gap；其他按比例。
 * 0 和 null 都返回 0（不画弧），但 0 仍渲染 rail。
 */
function progressToRatio(progress: number | null): number {
  if (progress === null || !Number.isFinite(progress)) return 0;
  const clamped = Math.min(100, Math.max(0, progress));
  if (clamped <= 0) return 0;
  if (clamped >= 100) return 1 - FULL_CIRCLE_GAP_RATIO;
  return clamped / 100;
}

export function WeeklyHeroRing({ quota, now }: WeeklyHeroRingProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const remaining = quota?.remainingPercent ?? null;
  const isUnavailable = remaining === null;
  const valueText = isUnavailable ? "—" : String(Math.round(remaining as number));
  const countdown = quota?.resetsAt
    ? formatCountdown(computeCountdownParts({ resetsAt: quota.resetsAt, now }), i18n.language)
    : null;

  const ratio = progressToRatio(remaining);
  const progressDash = isUnavailable ? 0 : CIRCUMFERENCE * ratio;
  const progressDasharray = String(progressDash) + " " + String(CIRCUMFERENCE);
  const health = HEALTH_I18N[quota?.health ?? "unavailable"];
  const rotateTransform = "rotate(-90 " + CENTER + " " + CENTER + ")";
  const viewBoxValue = "0 0 " + HERO.frame + " " + HERO.frame;
  const healthLabelKey = "health." + health;

  return (
    <div
      style={{
        position: "relative",
        width: `${HERO.frame}px`,
        height: `${HERO.frame}px`,
        flexShrink: 0,
      }}
    >
      <svg
        width={HERO.frame}
        height={HERO.frame}
        viewBox={viewBoxValue}
        preserveAspectRatio="xMidYMid meet"
        aria-label={t("quota.weeklyRemaining")}
        role="img"
        style={{ display: "block" }}
      >
        <g transform={rotateTransform}>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--c-rail)"
            strokeWidth={HERO.stroke}
            strokeLinecap="round"
            strokeDasharray={isUnavailable ? "4 4" : undefined}
          />
          {!isUnavailable && ratio > 0 ? (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="var(--c-accent-start)"
              strokeWidth={HERO.stroke}
              strokeLinecap="round"
              strokeDasharray={progressDasharray}
            />
          ) : null}
        </g>
      </svg>
      {/*
       * 中心内容：绝对定位叠加，flex column 居中。所有文字基于同一中心点。
       * 不用负 margin / 微调坐标（用户需求五.2）。
       */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: 600,
            color: "var(--c-secondary)",
          }}
        >
          {t("quota.weeklyRemaining")}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", color: "var(--c-ink)" }}>
          <span
            style={{
              fontFamily: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
              fontSize: "60px",
              lineHeight: "64px",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums lining-nums",
            }}
          >
            {valueText}
          </span>
          {!isUnavailable ? (
            <span
              style={{ fontSize: "31px", lineHeight: "32px", fontWeight: 600, marginLeft: "3px" }}
            >
              %
            </span>
          ) : null}
        </div>
        <StatusLabel status={health} label={t(healthLabelKey)} dotSize={6} />
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
    </div>
  );
}
