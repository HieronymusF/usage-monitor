/**
 * CodexCard — Codex 客户端的 Card 主组件（576×404 固定）。
 *
 * visual-spec §5 状态矩阵（quotaState 路由）：
 * - dual: FiveHourHero（左）+ SidePanel[WeeklySideRing]（右）+ TokenTray 3 列
 * - weekly-only: WeeklyHeroRing（左）+ SidePanel[TodayToken]（右）+ TokenTray 2 列
 * - five-only: FiveHourHero（左）+ SidePanel[WeeklyUnavailable]（右）+ TokenTray 3 列
 * - unavailable: UnavailableHero（左）+ EmptyPanel（右）+ TokenTray 3 列
 *
 * 数据状态（dataState）：
 * - loading: 占位 "正在加载…"
 * - offline: 占位 "本机数据桥暂不可用"
 * - 其余: 渲染 Card（stale/refresh-error 由 CardFooter 提示）
 *
 * 红线：
 * - 配额缺失显示"服务未提供"，不显示 0%/100%
 * - client=null（loading/offline）时显示占位，不渲染数据
 *
 * Design System：本文件已迁移到 token 化（DESIGN_SYSTEM.md §4/§8/§13）。
 * surface 内固定几何值（CARD_PADDING / MAIN_GRID_COLUMNS 等）属 visual-spec §2/§5 契约值，
 * 见 DESIGN_SYSTEM.md §13 白名单，声明为命名常量不进 spacing 表。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { UsageViewModel } from "../../domain/types";
import { GlassSurface } from "../foundations/GlassSurface";
import { Grid, Inline, Stack } from "../layout";
import { typography } from "../../styles/tokens";
import { CardFooter } from "./CardFooter";
import { CardHeader } from "./CardHeader";
import { TokenTray } from "./TokenTray";
import { FiveHourHero } from "./quota/FiveHourHero";
import { SidePanel } from "./quota/SidePanel";
import { UnavailableHero } from "./quota/UnavailableHero";
import { WeeklyHeroRing } from "./quota/WeeklyHeroRing";
import { ZCodeCardInner } from "./ZCodeCard";
import { useUsageViewModel } from "../../hooks/useUsageViewModel";
import { useCardWindowResize } from "../../hooks/useCardWindowResize";

/**
 * surface 内固定几何值（visual-spec §2/§5 契约，DESIGN_SYSTEM.md §13 白名单）。
 * 改这些值必须先改 visual-spec.md + design-tokens.json。
 */
const SURFACE_GEOMETRY = {
  windowCodex: { width: 576, height: 404 },
  windowZCode: { width: 576, height: 333 },
  visibleCodex: { width: 560, height: 388 },
  cardMargin: 8,
  cardPadding: { top: 22, horizontal: 24, bottom: 20 },
  headerHeight: 36,
  mainHeight: 214,
  mainGridColumns: "340px 20px 1px 20px 1fr",
  dividerHeight: 180,
} as const;

export function CodexCard(): React.ReactElement {
  const vm = useUsageViewModel();
  // 用户切换 client 时 resize Card 窗口（codex 576×404，zcode 576×333）。
  // 在 wrapper 层调用而不是 inner，避免 inner 的 early-return（loading/offline/zcode）跳过 hook 调用顺序。
  useCardWindowResize(vm.client?.kind);
  return <CodexCardInner vm={vm} onClose={() => window.close()} />;
}

export interface CodexCardInnerProps {
  vm: UsageViewModel;
  onClose: () => void;
}

export function CodexCardInner({ vm, onClose }: CodexCardInnerProps): React.ReactElement {
  const { t } = useTranslation();
  const g = SURFACE_GEOMETRY;
  const cardPaddingStyle = `${g.cardPadding.top}px ${g.cardPadding.horizontal}px ${g.cardPadding.bottom}px`;

  // loading / offline：占位
  if (vm.dataState === "loading" || vm.dataState === "offline" || vm.client === null) {
    return (
      <GlassSurface
        surface="card"
        style={{
          width: `${g.windowCodex.width}px`,
          height: `${g.windowCodex.height}px`,
          padding: cardPaddingStyle,
        }}
      >
        <Stack align="center" justify="center" gap="1_5" style={{ height: "100%" }}>
          <p
            style={{
              color: "var(--c-tertiary)",
              fontFamily: typography.body.fontFamily,
              fontSize: `${typography.body.fontSize}px`,
              lineHeight: `${typography.body.lineHeight}px`,
              fontWeight: typography.body.fontWeight,
            }}
          >
            {vm.dataState === "offline" ? t("footer.offline") : t("footer.loading")}
          </p>
        </Stack>
      </GlassSurface>
    );
  }

  const client = vm.client;
  if (client.kind === "zcode") {
    return <ZCodeCardInner vm={vm} onClose={onClose} />;
  }

  const quotaState = client.quotaState;

  return (
    <GlassSurface
      surface="card"
      style={{
        width: `${g.visibleCodex.width}px`,
        height: `${g.visibleCodex.height}px`,
        margin: `${g.cardMargin}px`,
        padding: cardPaddingStyle,
      }}
    >
      <Stack gap="1_5" style={{ height: "100%" }}>
        <div style={{ height: `${g.headerHeight}px`, flexShrink: 0 }}>
          <CardHeader
            clientKind={client.kind}
            planType={client.planType}
            onSwitchClient={() => undefined}
            onClose={onClose}
          />
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
            {quotaState === "weekly-only" ? (
              <WeeklyHeroRing quota={client.primaryQuota} now={() => new Date()} />
            ) : quotaState === "unavailable" ? (
              <UnavailableHero />
            ) : (
              <FiveHourHero quota={client.primaryQuota} now={() => new Date()} />
            )}
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
            <SidePanel
              quotaState={quotaState}
              secondaryQuota={client.secondaryQuota}
              client={client}
              now={() => new Date()}
            />
          </div>
        </Grid>

        <Inline gap="2" align="center">
          <div style={{ flex: 1, minWidth: 0 }}>
            <TokenTray client={client} quotaState={quotaState} />
          </div>
          <CardFooter fetchedAt={vm.fetchedAt} dataState={vm.dataState} />
        </Inline>
      </Stack>
    </GlassSurface>
  );
}
