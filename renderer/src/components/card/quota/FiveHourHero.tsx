/**
 * FiveHourHero — Codex 5h Hero（visual-spec §5 Codex Dual / FiveOnly 左侧）。
 *
 * 结构（WPF HeroFivePanel XAML L168-184）：
 * - 标签 "5 小时剩余"（caption tertiary）
 * - 大百分比 + %（Display XL 92 Bold）
 * - QuotaRail 横条
 * - 状态文字（充足/偏低/紧张/服务未提供）
 * - 重置倒计时（caption + 时钟图标）
 *
 * 红线：remainingPercent=null 时显示"服务未提供"，不显示 0%。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import type { Health, QuotaWindowViewModel } from "../../../domain/types";
import { computeCountdownParts, formatCountdown } from "../../../domain/format-countdown";
import { MetricValue } from "../../foundations/MetricValue";
import { StatusLabel } from "../../foundations/StatusLabel";
import { QuotaRail } from "./QuotaRail";

const HEALTH_I18N: Record<Health, "sufficient" | "low" | "critical" | "unavailable"> = {
  sufficient: "sufficient",
  low: "low",
  critical: "critical",
  unavailable: "unavailable",
};

export interface FiveHourHeroProps {
  quota: QuotaWindowViewModel | null;
  /** 用于倒计时（每秒 tick 由 useUsageViewModel 触发）。 */
  now: () => Date;
}

export function FiveHourHero({ quota, now }: FiveHourHeroProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const remaining = quota?.remainingPercent ?? null;
  const isUnavailable = remaining === null;
  const valueText = isUnavailable ? "—" : String(Math.round(remaining as number));
  const countdown = quota?.resetsAt
    ? formatCountdown(computeCountdownParts({ resetsAt: quota.resetsAt, now }), i18n.language)
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        width: "340px",
      }}
    >
      {/* 上中:label + 大数字 + 轨道(label 紧贴数字) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            lineHeight: "19px",
            color: "var(--c-tertiary)",
          }}
        >
          {t("quota.fiveHour")}
        </div>
        <MetricValue
          value={valueText}
          {...(isUnavailable ? {} : { unit: "%" })}
          variant="displayXL"
          color="var(--c-ink)"
        />
        <QuotaRail remainingPercent={remaining} />
      </div>
      {/* 下部:状态 + 重置倒计时 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <StatusLabel
          status={HEALTH_I18N[quota?.health ?? "unavailable"]}
          label={t(`health.${HEALTH_I18N[quota?.health ?? "unavailable"]}`)}
          dotSize={8}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "var(--c-tertiary)",
            fontSize: "13px",
            lineHeight: "19px",
          }}
        >
          <Clock size={13} aria-hidden="true" />
          <span>{countdown ?? t("footer.loading")}</span>
        </div>
      </div>
    </div>
  );
}
