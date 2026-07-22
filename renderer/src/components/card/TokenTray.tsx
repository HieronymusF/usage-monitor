/**
 * TokenTray — Card 底部 token 数据 3 列（visual-spec §3, §5）。
 *
 * Codex Dual/FiveOnly/NoQuota：3 列（当前任务/今日/本机累计）。
 * WeeklyOnly：2 列（当前任务/本机累计，今日上移到右侧 SidePanel）。
 *
 * WPF TokenSummaryThree（XAML L275-280）/ TokenSummaryTwo（L281-285）。
 * 色点：当前任务蓝、今日绿、本机累计紫（WPF L277-279）。
 *
 * Design System：本文件已迁移到 token 化（DESIGN_SYSTEM.md §4/§5/§6/§8）。
 * 关键变更（见 DESIGN_SYSTEM.md §11 迁移日志）：
 * - 删除历史 `marginLeft: "14px"` 视觉补偿值，改用 grid 列把圆点放第一列，
 *   标签和数字都从第二列起笔，二者天然左对齐（DESIGN_SYSTEM.md §8.3）。
 * - borderRadius 18 → radius.tray (22)，tray surface 必须对应。
 * - fontSize/gap/padding 全部 token 化。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { ClientUsageViewModel, QuotaState } from "../../domain/types";
import { formatToken } from "../../domain/format-token";
import { Grid } from "../layout";
import { radius, spacing, typography } from "../../styles/tokens";

export interface TokenTrayProps {
  client: ClientUsageViewModel;
  quotaState: QuotaState;
}

const TRAY_DOT_COLORS = {
  currentTask: "var(--c-accent-start)",
  today: "var(--c-success)",
  lifetime: "var(--c-violet-wash)",
} as const;

/** 色点几何（DESIGN_SYSTEM.md §11 装饰元素白名单：≤8px 圆点允许裸值）。 */
const DOT_SIZE = 6;

export function TokenTray({ client, quotaState }: TokenTrayProps): React.ReactElement {
  const { t } = useTranslation();
  const isWeeklyOnly = quotaState === "weekly-only";
  const currentTask = client.tokenUsage.currentTask;
  const today = client.tokenUsage.today;
  const lifetime = client.tokenUsage.lifetimeTotal;

  const cols = isWeeklyOnly
    ? [
        { label: t("tray.currentTask"), value: currentTask, color: TRAY_DOT_COLORS.currentTask },
        { label: t("tray.lifetime"), value: lifetime, color: TRAY_DOT_COLORS.lifetime },
      ]
    : [
        { label: t("tray.currentTask"), value: currentTask, color: TRAY_DOT_COLORS.currentTask },
        { label: t("tray.today"), value: today, color: TRAY_DOT_COLORS.today },
        { label: t("tray.lifetime"), value: lifetime, color: TRAY_DOT_COLORS.lifetime },
      ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
        gap: `${spacing["1_5"]}px`,
        padding: `${spacing["1"]}px ${spacing["2"]}px`,
        borderRadius: `${radius.tray}px`,
        background: "color-mix(in srgb, var(--c-rail) 30%, transparent)",
      }}
    >
      {cols.map((col) => {
        const text = col.value !== null ? (formatToken(col.value) ?? "—") : "—";
        return (
          /*
           * 每列内嵌 2 列 grid：[色点] [标签+数字栈]。
           * 色点列宽固定 = DOT_SIZE，gap = spacing["1"](8)。
           * 标签行和数字行都从第二列起笔，二者天然左对齐 —— 不需要 marginLeft 补偿。
           */
          <Grid
            key={col.label}
            columns={`${DOT_SIZE}px 1fr`}
            gap="1"
            align="start"
            style={{ minWidth: 0 }}
          >
            {/* 第 1 列：色点。垂直对齐到标签文字 x-height 中线。 */}
            <span
              aria-hidden="true"
              style={{
                width: `${DOT_SIZE}px`,
                height: `${DOT_SIZE}px`,
                borderRadius: "50%",
                background: col.color,
                /*
                 * 色点垂直居中到标签行：标签行高 typography.caption.lineHeight=19，
                 * 色点 6px，居中偏移 = (19-6)/2 ≈ 6.5px。用 marginTop 对齐到第一行基线，
                 * 这是装饰元素对齐，非视觉补偿（白名单见 DESIGN_SYSTEM.md §11）。
                 */
                marginTop: `${(typography.caption.lineHeight - DOT_SIZE) / 2}px`,
                flexShrink: 0,
              }}
            />
            {/* 第 2 列：标签 + 数字纵向栈，左对齐。 */}
            <div style={{ display: "flex", flexDirection: "column", gap: `${spacing["0_5"]}px` }}>
              <span
                style={{
                  fontFamily: typography.caption.fontFamily,
                  fontSize: `${typography.caption.fontSize}px`,
                  lineHeight: `${typography.caption.lineHeight}px`,
                  fontWeight: typography.caption.fontWeight,
                  color: "var(--c-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
              </span>
              <span
                style={{
                  fontFamily: typography.metricM.fontFamily,
                  fontSize: `${typography.metricM.fontSize}px`,
                  lineHeight: `${typography.metricM.lineHeight}px`,
                  fontWeight: typography.metricM.fontWeight,
                  fontVariantNumeric: "tabular-nums lining-nums",
                  color: "var(--c-ink)",
                  whiteSpace: "nowrap",
                }}
              >
                {text}
              </span>
            </div>
          </Grid>
        );
      })}
    </div>
  );
}
