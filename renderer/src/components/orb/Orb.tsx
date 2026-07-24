import React from "react";
/**
 * Orb — 收起球 82×136 窗口（visible 82×136，visual-spec §3 / §7）。
 *
 * v6 修正（用户 doc.md 第二版 + "半圆胶囊"明确指示）：
 * - 窗口 90×144 → **82×136**（doc.md 第一条）
 * - **visible = window**（doc.md 第四条：外层/背景层/描边层/裁切层完全重合，无多层裁切）
 * - **radius.orb 22 → 41**（= 宽度 82/2，真竖向胶囊：上下半圆 + 中间垂直侧边）
 * - ringGeometry.orb 66 → **62**（-6%，doc.md 第五条）
 * - 状态点 8 → **7**（-12%，doc.md 第五条）
 * - grip 3px 不变（已是最小可视尺寸）
 * - 黑边忽略（实测 v5 dark pixels=0，无需修）
 *
 * 垂直布局（明确 px，capsule 高 136）：
 *   y=10: grip dots（h=3）
 *   y=23: ring 顶（62×62）→ ring 中心 y=54（=136×40%）
 *   y=85: ring 底
 *   y=101: 状态点中心（7×7，距 ring 底 16px）
 *   y=105: 状态点底（距胶囊底 31px）
 *
 * Codex 4 态：Dual/FiveOnly → 5h N% + "5H"；WeeklyOnly → weekly N% + "周"；NoQuota → "—"
 * ZCode（红线）：不渲染 ring/百分比，大数字 = 今日 Token，标签 = 今日
 *
 * 红线（AGENTS.md / HANDOFF §7）：查 visible text，不扫 innerHTML（L4）
 *
 * Design System：GlassSurface surface="orb"（radius.orb=41，真胶囊）。
 * typography 逐字段引用 + lineHeight 显式 px（L1）。
 * 不抽 useOrbViewModel（§7 "Bar 用同 vm" 契约对齐）。
 */

import { useTranslation } from "react-i18next";
import type {
  ClientUsageViewModel,
  Health,
  QuotaWindowViewModel,
  UsageViewModel,
} from "../../domain/types";
import { formatToken } from "../../domain/format-token";
import { GlassSurface } from "../foundations/GlassSurface";
import { useOrbDrag } from "../../hooks/useOrbDrag";
import { ProgressRing } from "../foundations/ProgressRing";
import { useUsageViewModel } from "../../hooks/useUsageViewModel";
import { typography } from "../../styles/tokens";

/**
 * v6：所有垂直位置用明确 px（doc.md 第二版第六条禁用 space-between）。
 * visible = window = 82×136（无边距，外/背景/描边/裁切层完全重合）。
 */
const SURFACE_GEOMETRY = {
  visible: { width: 82, height: 136 },
  ringFrame: 62, // v6：visual-spec §7 Orb Ring（从 66 改 62，-6%）
  paddingX: 10, // 82 - 62 = 20，两侧各 10（ring 居中）
  gripTop: 10, // grip dots 距 capsule 顶
  ringTop: 23, // ring 距 capsule 顶（grip 底 13 + 间距 10）
  statusTopFromRingBottom: 16, // 状态点距 ring 底
  gripDotSize: 3,
  gripDotGap: 5,
  statusDotSize: 7, // v6：从 8 改 7（doc.md 第五条 -3~5%）
} as const;

/** 健康度 → 状态点颜色（与 StatusLabel / IndicatorBar StatusDot 同映射）。 */
const HEALTH_COLOR: Record<Health, string> = {
  sufficient: "var(--c-success)",
  low: "var(--c-warning)",
  critical: "var(--c-danger)",
  unavailable: "var(--c-tertiary)",
};

/** 健康度 → i18n key（状态点 aria-label，不只靠颜色表达）。 */
const HEALTH_I18N_KEY: Record<Health, string> = {
  sufficient: "health.sufficient",
  low: "health.low",
  critical: "health.critical",
  unavailable: "health.unavailable",
};

export function Orb(): React.ReactElement {
  const vm = useUsageViewModel();
  return <OrbInner vm={vm} />;
}

export interface OrbInnerProps {
  vm: UsageViewModel;
}

export function OrbInner({ vm }: OrbInnerProps): React.ReactElement {
  if (vm.dataState === "loading" || vm.dataState === "offline" || vm.client === null) {
    return (
      <OrbShell statusHealth="unavailable">
        <GripDots />
        <span
          style={{
            ...dashStyle(),
            position: "absolute",
            top: 23,
            left: 0,
            right: 0,
            textAlign: "center",
          }}
        >
          —
        </span>
      </OrbShell>
    );
  }

  const client = vm.client;
  return client.kind === "zcode" ? <ZCodeOrb client={client} /> : <CodexOrb client={client} />;
}

/**
 * Orb 外壳：GlassSurface surface="orb"，position:relative 让内部绝对定位。
 * v6：visible=window=82×136（doc.md 第四条：所有层完全重合）。
 */
function OrbShell({
  children,
  statusHealth,
}: {
  children: React.ReactNode;
  statusHealth: Health;
}): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  // D-3 切片 3：no-drag 覆盖 App.tsx 的 WebkitAppRegion:"drag"，由 useOrbDrag 接管拖动/click。
  // OS drag 会抑制 renderer 指针事件，无法做 6 DIP 阈值或 click/drag 区分，故改 JS 驱动。
  const drag = useOrbDrag();
  return (
    <GlassSurface
      surface="orb"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      style={
        {
          width: `${g.visible.width}px`,
          height: `${g.visible.height}px`,
          // v4：去共享层 border，用 box-shadow 做边缘
          borderWidth: "0px",
          borderStyle: "none",
          boxShadow:
            "inset 0 1px 0 color-mix(in srgb, white 50%, transparent), inset 0 0 0 1px color-mix(in srgb, white 18%, transparent)",
          padding: 0,
          position: "relative",
          // v6：overflow hidden 保证内容不溢出胶囊轮廓（doc.md 第三条 CSS 参考）
          overflow: "hidden",
          // D-3 切片 3：覆盖 App.tsx drag，接管为 click 展开 + JS 拖动
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
    >
      {children}
      <StatusDot health={statusHealth} />
    </GlassSurface>
  );
}

// ---------- Codex Orb ----------

function CodexOrb({ client }: { client: ClientUsageViewModel }): React.ReactElement {
  const { t } = useTranslation();
  const primary = client.primaryQuota;
  const secondary = client.secondaryQuota;
  // 主数字优先 5h（v3 起，对齐设计稿 42%）。
  const fiveHourQuota: QuotaWindowViewModel | null =
    primary?.kind === "five-hour" ? primary : secondary?.kind === "five-hour" ? secondary : null;
  const weeklyQuota: QuotaWindowViewModel | null =
    primary?.kind === "weekly" ? primary : secondary?.kind === "weekly" ? secondary : null;

  const mainQuota = fiveHourQuota ?? weeklyQuota;
  const mainPercent = mainQuota?.remainingPercent ?? null;
  const mainText = mainPercent === null ? "—" : `${Math.round(mainPercent)}%`;
  const label =
    fiveHourQuota !== null
      ? t("bar.fiveHourShort")
      : weeklyQuota !== null
        ? t("bar.weeklyShort")
        : "—";

  const health: Health = mainQuota?.health ?? "unavailable";
  const ringProgress = mainQuota?.remainingPercent ?? null;

  const g = SURFACE_GEOMETRY;
  // ring 容器绝对定位（明确 px，不用 flex）
  return (
    <OrbShell statusHealth={health}>
      <GripDots />
      <div
        style={{
          position: "absolute",
          top: `${g.ringTop}px`,
          left: "50%",
          transform: "translateX(-50%)",
          width: g.ringFrame,
          height: g.ringFrame,
        }}
      >
        <ProgressRing size="orb" progress={ringProgress} aria-label={t("quota.weekly")} />
        <div style={ringCenterOverlayStyle()}>
          <span style={metricMStyle()}>{mainText}</span>
          <span style={captionStyle()}>{label}</span>
        </div>
      </div>
    </OrbShell>
  );
}

// ---------- ZCode Orb（红线：不渲染圆环 / 配额） ----------

function ZCodeOrb({ client }: { client: ClientUsageViewModel }): React.ReactElement {
  const { t } = useTranslation();
  const today = client.tokenUsage.today;
  const todayText = today !== null ? (formatToken(today) ?? "—") : "—";
  const g = SURFACE_GEOMETRY;
  return (
    <OrbShell statusHealth="unavailable">
      <GripDots />
      <div
        style={{
          position: "absolute",
          top: `${g.ringTop}px`,
          left: "50%",
          transform: "translateX(-50%)",
          width: g.ringFrame,
          height: g.ringFrame,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
        }}
      >
        <span style={metricMStyle()}>{todayText}</span>
        <span style={captionStyle()}>{t("tray.today")}</span>
      </div>
    </OrbShell>
  );
}

// ---------- 局部组件 ----------

/** 顶部 3 个 grip dots（实色，绝对定位距顶 10px）。 */
function GripDots(): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: `${g.gripTop}px`,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: `${g.gripDotGap}px`,
        alignItems: "center",
        height: `${g.gripDotSize}px`,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: `${g.gripDotSize}px`,
            height: `${g.gripDotSize}px`,
            borderRadius: "50%",
            background: "var(--c-secondary)",
            opacity: 1,
          }}
        />
      ))}
    </div>
  );
}

/** 底部状态点（绝对定位，v6: 7px，距 ring 底 16px）。 */
function StatusDot({ health }: { health: Health }): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  const { t } = useTranslation();
  // top = ringTop + ringFrame + statusTopFromRingBottom
  const top = g.ringTop + g.ringFrame + g.statusTopFromRingBottom;
  // a11y：状态点不只靠颜色（DEVELOPMENT-PLAN §12），role=img + aria-label 让屏幕阅读器读出健康度。
  return (
    <span
      role="img"
      aria-label={t(HEALTH_I18N_KEY[health])}
      style={{
        position: "absolute",
        top: `${top}px`,
        left: "50%",
        transform: "translateX(-50%)",
        display: "inline-block",
        width: `${g.statusDotSize}px`,
        height: `${g.statusDotSize}px`,
        borderRadius: "50%",
        background: HEALTH_COLOR[health],
      }}
    />
  );
}

/** 圆环内盘绝对定位居中（数字 + 标签垂直堆叠，gap 3）。 */
function ringCenterOverlayStyle(): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    pointerEvents: "none",
  };
}

/** 主数字：20px / weight 500（v3 设计稿要求"主缩 10-15%/降一级"）。 */
function metricMStyle(): React.CSSProperties {
  return {
    fontFamily: typography.metricM.fontFamily,
    fontSize: "20px",
    lineHeight: "26px",
    fontWeight: 500,
    color: "var(--c-ink)",
    fontVariantNumeric: "tabular-nums lining-nums",
  };
}

/** 小标签：12px（v3 设计稿要求"次缩 20-25%"）。 */
function captionStyle(): React.CSSProperties {
  return {
    fontFamily: typography.caption.fontFamily,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: typography.caption.fontWeight,
    color: "var(--c-secondary)",
  };
}

function dashStyle(): React.CSSProperties {
  return {
    fontFamily: typography.metricM.fontFamily,
    fontSize: "20px",
    lineHeight: "26px",
    fontWeight: 500,
    color: "var(--c-tertiary)",
  };
}
