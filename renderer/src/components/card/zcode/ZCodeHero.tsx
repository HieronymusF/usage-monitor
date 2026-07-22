/**
 * ZCodeHero — ZCode Card 左侧今日 Token Hero（visual-spec §5 ZCode LocalData / NoData）。
 *
 * 与 Codex FiveHourHero 的关键差异：
 * - 值是 token 数（formatToken），不是百分比；不带 `%` 单位。
 * - 不渲染 QuotaRail 进度条（ZCode 永远没有配额）。
 * - StatusLabel 恒为 unavailable + "服务未提供"（红线：ZCode 不显示虚构配额健康度）。
 * - NoData 态：today=null 时显示 `—`，结构不变。
 *
 * Design System：typography 引用逐字段 + lineHeight 显式 px（AGENT_LESSONS L2/L4，
 * HANDOFF §10.2 P0-1：禁止 spread typography 到 style）。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { TokenUsageViewModel } from "../../../domain/types";
import { formatToken } from "../../../domain/format-token";
import { MetricValue } from "../../foundations/MetricValue";
import { StatusLabel } from "../../foundations/StatusLabel";
import { typography } from "../../../styles/tokens";

export interface ZCodeHeroProps {
  tokenUsage: TokenUsageViewModel;
}

export function ZCodeHero({ tokenUsage }: ZCodeHeroProps): React.ReactElement {
  const { t } = useTranslation();
  const today = tokenUsage.today;
  const valueText = today !== null ? (formatToken(today) ?? "—") : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "340px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <div
          style={{
            fontFamily: typography.caption.fontFamily,
            fontSize: `${typography.caption.fontSize}px`,
            lineHeight: `${typography.caption.lineHeight}px`,
            fontWeight: typography.caption.fontWeight,
            color: "var(--c-tertiary)",
          }}
        >
          {t("tray.today")}
        </div>
        <MetricValue value={valueText} variant="displayXL" color="var(--c-ink)" />
      </div>
      <StatusLabel status="unavailable" label={t("health.unavailable")} dotSize={8} />
    </div>
  );
}
