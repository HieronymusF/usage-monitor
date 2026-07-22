/**
 * ZCodeCard — ZCode 客户端的 Card 主组件（576×333 固定）。
 *
 * visual-spec §5 状态矩阵（ZCode 两行）：
 * - LocalData：左 ZCodeHero（今日 Token displayXL）+ 右 ZCodeSidePanel（本机累计/模型）+ 底 2 列（今日/本机累计）
 * - NoData：左 Hero `—` + 右"服务未提供" + 底可用项保留
 *
 * 红线（AGENTS.md + visual-spec §5）：
 * - ZCode 永远不显示配额百分比、倒计时、健康度（除 unavailable 占位）
 * - 缺失字段显示 `—` 或"服务未提供"，不显示 0%/100%/估算值
 *
 * 调用方契约：本组件只在 `vm.client?.kind === "zcode"` 且非 loading/offline 时被 CodexCard 调用。
 * loading/offline 占位由 CodexCard 前置分支处理。
 *
 * Design System：token 化已就绪（surfaceSizes.cardZCode / typography / spacing / radius）。
 * surface 内固定几何值（mainHeight / dividerHeight / mainGridColumns）属 visual-spec §3/§5 契约值，
 * 见 DESIGN_SYSTEM.md §13 白名单。
 *
 * 已知缺口（HANDOFF 记录）：
 * - 窗口固定 576×404（electron/windows/card.ts:8），ZCode 顶部对齐渲染底部约 71px 透明留白。
 *   窗口动态 resize 推迟到 DPI/多屏任务。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { UsageViewModel } from "../../domain/types";
import { surfaceSizes, spacing, radius, typography } from "../../styles/tokens";
import { formatToken } from "../../domain/format-token";
import { GlassSurface } from "../foundations/GlassSurface";
import { Grid, Inline, Stack } from "../layout";
import { CardFooter } from "./CardFooter";
import { CardHeader } from "./CardHeader";
import { ZCodeHero } from "./zcode/ZCodeHero";
import { ZCodeSidePanel } from "./zcode/ZCodeSidePanel";
import { useUsageViewModel } from "../../hooks/useUsageViewModel";

/**
 * surface 内固定几何值（visual-spec §3/§5 契约，DESIGN_SYSTEM.md §13 白名单）。
 * ZCode Card visible 560×317，padding 22/24/20，header 36，剩 main+tray 区。
 * main 高度 = 317 - 22 - 20 - 36(header) - 6(stack gap) - 6(stack gap) - 75(tray) = 152。
 */
const SURFACE_GEOMETRY = {
  cardPadding: { top: 22, horizontal: 24, bottom: 20 },
  headerHeight: 36,
  mainHeight: 152,
  mainGridColumns: "340px 20px 1px 20px 1fr",
  dividerHeight: 120,
} as const;

/** 底部 tray 色点（DESIGN_SYSTEM.md §11 装饰元素白名单：≤8px 圆点允许裸值）。 */
const DOT_SIZE = 6;
const TRAY_DOT_COLORS = {
  today: "var(--c-success)",
  lifetime: "var(--c-violet-wash)",
} as const;

export function ZCodeCard(): React.ReactElement {
  const vm = useUsageViewModel();
  return <ZCodeCardInner vm={vm} onClose={() => window.close()} />;
}

export interface ZCodeCardInnerProps {
  vm: UsageViewModel;
  onClose: () => void;
}

export function ZCodeCardInner({ vm, onClose }: ZCodeCardInnerProps): React.ReactElement {
  const { t } = useTranslation();
  const g = SURFACE_GEOMETRY;
  const cardPaddingStyle = `${g.cardPadding.top}px ${g.cardPadding.horizontal}px ${g.cardPadding.bottom}px`;
  const client = vm.client!;
  const tokenUsage = client.tokenUsage;

  const today = tokenUsage.today;
  const todayText = today !== null ? (formatToken(today) ?? "—") : "—";
  const lifetime = tokenUsage.lifetimeTotal;
  const lifetimeText = lifetime !== null ? (formatToken(lifetime) ?? "—") : "—";

  const trayCols = [
    { label: t("tray.today"), value: todayText, color: TRAY_DOT_COLORS.today },
    { label: t("tray.lifetime"), value: lifetimeText, color: TRAY_DOT_COLORS.lifetime },
  ];

  return (
    <GlassSurface
      surface="card"
      style={{
        width: `${surfaceSizes.cardZCode.visibleWidth}px`,
        height: `${surfaceSizes.cardZCode.visibleHeight}px`,
        margin: "8px",
        padding: cardPaddingStyle,
      }}
    >
      <Stack gap="1" style={{ height: "100%" }}>
        <div style={{ height: `${g.headerHeight}px`, flexShrink: 0 }}>
          <CardHeader clientKind={client.kind} onSwitchClient={() => undefined} onClose={onClose} />
        </div>

        <Grid columns={g.mainGridColumns} align="center" style={{ height: `${g.mainHeight}px` }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              height: "100%",
              minWidth: 0,
            }}
          >
            <ZCodeHero tokenUsage={tokenUsage} />
          </div>
          <div />
          <div
            style={{
              width: "1px",
              height: `${g.dividerHeight}px`,
              background: "var(--c-border)",
            }}
          />
          <div />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minWidth: 0,
            }}
          >
            <ZCodeSidePanel tokenUsage={tokenUsage} />
          </div>
        </Grid>

        <Inline gap="2" align="center">
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 底部 tray：今日 + 本机累计 2 列（mirror TokenTray 结构但字段不同，不复用）。
                色点列固定宽，标签+数字从第二列起笔，天然左对齐（无 marginLeft 补偿）。 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${trayCols.length}, 1fr)`,
                gap: `${spacing["1_5"]}px`,
                padding: `${spacing["1"]}px ${spacing["2"]}px`,
                borderRadius: `${radius.tray}px`,
                background: "color-mix(in srgb, var(--c-rail) 30%, transparent)",
              }}
            >
              {trayCols.map((col) => (
                <Grid
                  key={col.label}
                  columns={`${DOT_SIZE}px 1fr`}
                  gap="1"
                  align="start"
                  style={{ minWidth: 0 }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: `${DOT_SIZE}px`,
                      height: `${DOT_SIZE}px`,
                      borderRadius: "50%",
                      background: col.color,
                      marginTop: `${(typography.caption.lineHeight - DOT_SIZE) / 2}px`,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: `${spacing["0_5"]}px` }}
                  >
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
                      {col.value}
                    </span>
                  </div>
                </Grid>
              ))}
            </div>
          </div>
          <CardFooter fetchedAt={vm.fetchedAt} dataState={vm.dataState} />
        </Inline>
      </Stack>
    </GlassSurface>
  );
}
