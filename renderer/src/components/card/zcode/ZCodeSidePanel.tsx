/**
 * ZCodeSidePanel — ZCode Card 右侧主区（visual-spec §5 ZCode LocalData / NoData）。
 *
 * LocalData：纵向栈
 * - 上块：本机累计（displayS 34/42 Bold，visual-spec §5 ZCode 次级指标档）
 * - 下块：模型名（metricM 22/28，取 models[0].name，无则 `—`）
 *
 * NoData（tokenUsage 全空）：整块替换为 StatusLabel "服务未提供"。
 *
 * 与 Codex SidePanel.TodayTokenPanel 的差异：字段是 lifetime + models（不是 today + lifetime，
 * 今日已在左侧 Hero）。结构镜像，不复用——Codex SidePanel 与 quotaState 强耦合。
 *
 * Design System：typography 逐字段 + lineHeight 显式 px（AGENT_LESSONS L2/L4）。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { TokenUsageViewModel } from "../../../domain/types";
import { formatToken } from "../../../domain/format-token";
import { StatusLabel } from "../../foundations/StatusLabel";
import { typography } from "../../../styles/tokens";

export interface ZCodeSidePanelProps {
  tokenUsage: TokenUsageViewModel;
}

export function ZCodeSidePanel({ tokenUsage }: ZCodeSidePanelProps): React.ReactElement {
  const { t } = useTranslation();

  // NoData：今日和累计都缺失 → 显示"服务未提供"，不显示虚构值。
  // 模型名即使存在也不显示（visual-spec §5 NoData 行：右侧固定"服务未提供"）。
  const isNoData = tokenUsage.today === null && tokenUsage.lifetimeTotal === null;
  if (isNoData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "160px" }}>
        <StatusLabel status="unavailable" label={t("health.unavailable")} dotSize={6} />
      </div>
    );
  }

  const lifetime = tokenUsage.lifetimeTotal;
  const lifetimeText = lifetime !== null ? (formatToken(lifetime) ?? "—") : "—";
  const modelName = tokenUsage.models[0]?.name ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "160px" }}>
      {/* 本机累计（次级主指标） */}
      <div>
        <div
          style={{
            fontFamily: typography.caption.fontFamily,
            fontSize: `${typography.caption.fontSize}px`,
            lineHeight: `${typography.caption.lineHeight}px`,
            fontWeight: typography.caption.fontWeight,
            color: "var(--c-tertiary)",
          }}
        >
          {t("tray.lifetime")}
        </div>
        <div
          style={{
            fontFamily: typography.displayS.fontFamily,
            fontSize: `${typography.displayS.fontSize}px`,
            lineHeight: `${typography.displayS.lineHeight}px`,
            fontWeight: typography.displayS.fontWeight,
            fontVariantNumeric: "tabular-nums lining-nums",
            color: "var(--c-ink)",
          }}
        >
          {lifetimeText}
        </div>
      </div>
      {/* 模型名（ZCode 常有，Codex 通常为空） */}
      <div>
        <div
          style={{
            fontFamily: typography.caption.fontFamily,
            fontSize: `${typography.caption.fontSize}px`,
            lineHeight: `${typography.caption.lineHeight}px`,
            fontWeight: typography.caption.fontWeight,
            color: "var(--c-tertiary)",
          }}
        >
          {t("tray.models")}
        </div>
        <div
          style={{
            fontFamily: typography.metricM.fontFamily,
            fontSize: `${typography.metricM.fontSize}px`,
            lineHeight: `${typography.metricM.lineHeight}px`,
            fontWeight: typography.metricM.fontWeight,
            color: "var(--c-ink)",
          }}
        >
          {modelName}
        </div>
      </div>
    </div>
  );
}
