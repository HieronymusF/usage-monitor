import React from "react";
/**
 * EdgeCapsule — 展开态信息卡片 720×180（visual-spec §3 / §8）。
 *
 * v26（D-2 收尾）：行为接入 + token 化 + 规范统一。
 *   - ActionRail 复用 IconButton（size="rail" 40×40），自带 tooltip/hover/pressed/focus-visible/no-drag
 *   - 切换客户端 / 刷新 / 主题 三态循环 接入真实 store/bridge（不再是 () => undefined）
 *   - EdgeWing 收起控件改为 native <button>（键盘可达、Enter/Space、no-drag）
 *   - 删除所有硬编码 hex/rgba/字号：inkColor/secondaryColor/tertiaryColor → var(--c-ink/-secondary/-tertiary)；
 *     字号 → typography token（displayS/metricL/labelL/body/caption）
 *   - 删除左侧主额度区重复的「更新于」，只在今日 Token 下保留一次
 *   - 主题三态：auto→light→dark→auto 单按钮循环（持久化延后 Milestone G）
 *
 * 几何（W=720 H=180，v21-v25 锁定）：
 *   ┌───────────────────────────────╮ ◯ ╮
 *   │ CODEX · {PLAN}                │   │
 *   │ 每周额度  │ 重置  │ 今日 Token│42%│ ← 翼片弧形包裹圆环
 *   │ 64%  ◯  │ 6天后 │ 1.7M     │ ◯ │   ActionRail(58) + gap(24) + EdgeWing(92)
 *   │          │       │ 更新时间 │ ● │
 *   └───────────────────────────────╯ ◯ ╯
 *
 * 红线（AGENTS.md / HANDOFF §7）：ZCode 不渲染配额 ring / 百分比（visible text 查，L4）
 */

import { useTranslation } from "react-i18next";
import type {
  ClientUsageViewModel,
  DataState,
  Health,
  QuotaWindowViewModel,
  UsageViewModel,
} from "../../domain/types";
import { formatToken } from "../../domain/format-token";
import { computeCountdownParts, pickRelevantParts } from "../../domain/format-countdown";
import { formatCodexBrand } from "../../domain/usage-view-model";
import { FluentIcon, type FluentIconName } from "../foundations/FluentIcon";
import { GlassSurface } from "../foundations/GlassSurface";
import { IconButton } from "../foundations/IconButton";
import { ProgressRing } from "../foundations/ProgressRing";
import { useThemeStore, type ThemePreference } from "../../stores/themeStore";
import { useUsageStore } from "../../stores/usageStore";
import { useUsageViewModel } from "../../hooks/useUsageViewModel";
import { typography } from "../../styles/tokens";

/** v22 几何：主卡片 + **统一 RightControls 容器**（解决 ActionRail/EdgeWing 重叠）。
 *
 * v22 关键架构（用户反馈第十三轮）：
 *   - Grid 改为 3 列（`1fr 1fr 1fr`），删除功能栏列
 *   - Grid 内容层宽度 = W - RightControls 宽（174）= 546
 *   - **RightControls** 绝对定位容器：`right:0 width:174 height:100%`
 *     内部 `grid-template-columns: 58px 24px 92px`（ActionRail + gap + EdgeWing）
 *   - ActionRail 和 EdgeWing 在同一容器内，**互不重叠**
 */
const SURFACE_GEOMETRY = {
  window: { width: 720, height: 180 },
  cardRadius: 20,
  padding: { horizontal: 22, vertical: 18 },
  // v22 Grid：3 数据列等宽（无功能栏列）
  gridColumns: "repeat(3, minmax(0, 1fr))" as const,
  // 分隔线
  dividerWidth: 1,
  dividerHeight: 120, // v25：缩短到 120px（用户要求 115~125）
  dividerOpacity: 0.22,
  // v20 主 ring（左侧，不动）
  mainRingSize: "orb" as const,
  mainRingFrame: 52,
  mainPercentRingGap: 10,
  // v22 RightControls 容器：宽度 174，内部三列 58 + 24(gap) + 92
  rightControlsWidth: 174,
  rightControlsGap: 24, // ActionRail 和 EdgeWing 之间的间隔列
  actionRailWidth: 58, // v22：60→58（用户建议 58~62）
  edgeWingWidth: 92, // v22：88→92（用户建议 84~92）
  // v23 弧形翼片 SVG（向左展开包裹圆环+状态点）
  // 控制点 X=-10（超出列坐标系 0），让中段最左处 ≈15（列坐标）= 643（主卡）
  // 圆环左缘 655 > 643 → 圆环完整在翼片内
  wingIndentX: -10,
  wingControlTop: 30,
  wingControlBot: 150,
  // v22 翼片内圆环（缩小到 50）
  edgeRingSize: "handle" as const,
  edgeRingFrame: 50,
  // v22 状态点（9px + 描边）
  edgeStatusDotSize: 9,
  edgeStatusDotBottom: 34,
  // v22 ActionRail 容器
  actionRailHeight: 140,
  actionRailRadius: 30,
  // v30 图标：visual-spec §图标 — Icon 16 或 18。统一使用 Fluent System Icons SVG。
  actionButtonSize: 40,
  actionIconSize: 18,
} as const;

const HEALTH_COLOR: Record<Health, string> = {
  sufficient: "var(--c-success)",
  low: "var(--c-warning)",
  critical: "var(--c-danger)",
  unavailable: "var(--c-tertiary)",
};

/** 主题三态循环顺序：auto → light → dark → auto。 */
const THEME_CYCLE: readonly ThemePreference[] = ["auto", "light", "dark"];

/** 返回 current 的下一态（auto→light→dark→auto）。 */
function nextThemePreference(current: ThemePreference): ThemePreference {
  const idx = THEME_CYCLE.indexOf(current);
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!;
}

export function EdgeCapsule(): React.ReactElement {
  const { refresh, ...vm } = useUsageViewModel();
  const activeClient = useUsageStore((s) => s.activeClient);
  const setActiveClient = useUsageStore((s) => s.setActiveClient);
  const themePreference = useThemeStore((s) => s.preference);
  const setThemePreference = useThemeStore((s) => s.setPreference);

  const handleSwitchClient = (): void => {
    setActiveClient(activeClient === "codex" ? "zcode" : "codex");
  };
  const handleCycleTheme = (): void => {
    setThemePreference(nextThemePreference(themePreference));
  };

  return (
    <EdgeCapsuleInner
      vm={vm}
      // v27：收起切回 Orb（showSurface("orb") → main 调 showOnly，隐藏 edge-capsule 显示 orb，不退出应用）
      onClose={() => window.monitor.showSurface("orb")}
      onSwitchClient={handleSwitchClient}
      onRefresh={() => void refresh()}
      onCycleTheme={handleCycleTheme}
      themePreference={themePreference}
    />
  );
}

export interface EdgeCapsuleInnerProps {
  vm: UsageViewModel;
  onClose: () => void;
  onSwitchClient: () => void;
  onRefresh: () => void;
  onCycleTheme: () => void;
  themePreference: ThemePreference;
}

export function EdgeCapsuleInner({
  vm,
  onClose,
  onSwitchClient,
  onRefresh,
  onCycleTheme,
  themePreference,
}: EdgeCapsuleInnerProps): React.ReactElement {
  const { t } = useTranslation();

  if (vm.dataState === "loading" || vm.dataState === "offline" || vm.client === null) {
    return (
      <CapsuleShell
        onClose={onClose}
        vm={vm}
        onSwitchClient={onSwitchClient}
        onRefresh={onRefresh}
        onCycleTheme={onCycleTheme}
        themePreference={themePreference}
      >
        <span style={bodyTextStyle()}>{t("footer.loading")}</span>
      </CapsuleShell>
    );
  }

  const client = vm.client;
  return (
    <CapsuleShell
      onClose={onClose}
      vm={vm}
      onSwitchClient={onSwitchClient}
      onRefresh={onRefresh}
      onCycleTheme={onCycleTheme}
      themePreference={themePreference}
    >
      {client.kind === "zcode" ? (
        <ZCodeCapsuleBody client={client} vm={vm} />
      ) : (
        <CodexCapsuleBody client={client} vm={vm} />
      )}
    </CapsuleShell>
  );
}

/**
 * v21 复合外壳：**主卡片普通圆角矩形 + 右侧弧形翼片 SVG 覆盖层**。
 *
 * v21 关键架构变化（用户反馈第十二轮）：
 *   - 主卡片就是**普通 4 角圆角矩形**（统一背景、圆角、描边、阴影）
 *   - 右侧改为**弧形翼片**（SVG path 绘制）：上下窄、中间宽，左边界大弧线，右边界贴主卡片右边缘
 *   - 弧形翼片是**绝对定位 SVG 覆盖层**（在主卡片之上），不参与 Grid 宽度计算
 */
function CapsuleShell({
  children,
  onClose,
  vm,
  onSwitchClient,
  onRefresh,
  onCycleTheme,
  themePreference,
}: {
  children: React.ReactNode;
  onClose: () => void;
  vm: UsageViewModel;
  onSwitchClient: () => void;
  onRefresh: () => void;
  onCycleTheme: () => void;
  themePreference: ThemePreference;
}): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  const W = g.window.width;
  const H = g.window.height;
  const r = g.cardRadius;

  // v21 主卡片 mask：普通 4 角圆角矩形（删除复合 path）
  const mainCardPath = [
    `M ${r} 0`,
    `L ${W - r} 0`,
    `A ${r} ${r} 0 0 1 ${W} ${r}`,
    `L ${W} ${H - r}`,
    `A ${r} ${r} 0 0 1 ${W - r} ${H}`,
    `L ${r} ${H}`,
    `A ${r} ${r} 0 0 1 0 ${H - r}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");

  const maskSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' width='${W}' height='${H}'>` +
      `<path d='${mainCardPath}' fill='white'/></svg>`,
  )}`;

  return (
    <div
      style={{
        position: "relative",
        width: `${W}px`,
        height: `${H}px`,
        overflow: "hidden",
        borderRadius: `${r}px`,
      }}
    >
      {/* v22 主卡片：普通 4 角圆角矩形（唯一 GlassSurface，含完整背景/圆角/描边/阴影） */}
      <GlassSurface
        surface="capsule"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${W}px`,
          height: `${H}px`,
          padding: 0,
          borderWidth: "0px",
          borderStyle: "none",
          borderRadius: "0px",
          WebkitMaskImage: `url("${maskSvg}")`,
          maskImage: `url("${maskSvg}")`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          boxShadow:
            "inset 0 1px 0 color-mix(in srgb, white 55%, transparent), inset 0 0 0 1px color-mix(in srgb, white 20%, transparent), 0 4px 16px color-mix(in srgb, black 12%, transparent), 0 1px 3px color-mix(in srgb, black 8%, transparent)",
        }}
      >
        {/* v22 主内容层（Grid 3 列，宽度 = W - RightControls 宽，给右侧让出空间） */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${W - g.rightControlsWidth}px`,
            height: "100%",
            padding: `${g.padding.vertical}px ${g.padding.horizontal}px`,
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: g.gridColumns,
            columnGap: "0px",
            alignItems: "stretch",
          }}
        >
          {children}
        </div>
      </GlassSurface>
      {/* v22 统一 RightControls 容器（绝对定位 right:0，固定三列 grid 约束 ActionRail + EdgeWing） */}
      <RightControls
        onClose={onClose}
        vm={vm}
        onSwitchClient={onSwitchClient}
        onRefresh={onRefresh}
        onCycleTheme={onCycleTheme}
        themePreference={themePreference}
      />
    </div>
  );
}

/**
 * v22 统一右侧控件容器（RightControls）。
 *
 * 架构（用户反馈第十三轮）：
 *   - 绝对定位 right:0 top:0 width:174 height:100%
 *   - 内部 grid 三列：`58px 24px 92px`（ActionRail + gap + EdgeWing）
 *   - ActionRail 和 EdgeWing 在同一容器内，**互不重叠**
 *   - pointerEvents: none 容器本身，子元素 auto
 */
function RightControls({
  onClose,
  vm,
  onSwitchClient,
  onRefresh,
  onCycleTheme,
  themePreference,
}: {
  onClose: () => void;
  vm: UsageViewModel;
  onSwitchClient: () => void;
  onRefresh: () => void;
  onCycleTheme: () => void;
  themePreference: ThemePreference;
}): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: `${g.rightControlsWidth}px`,
        height: "100%",
        display: "grid",
        gridTemplateColumns: `${g.actionRailWidth}px ${g.rightControlsGap}px ${g.edgeWingWidth}px`,
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {/* 第 1 列：ActionRail（3 个操作图标，独立玻璃背景） */}
      <div
        style={{
          pointerEvents: "auto",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActionRail
          onSwitchClient={onSwitchClient}
          onRefresh={onRefresh}
          onCycleTheme={onCycleTheme}
          themePreference={themePreference}
        />
      </div>
      {/* 第 2 列：间隔（无内容） */}
      <div />
      {/* 第 3 列：EdgeWing（弧形翼片背景 SVG + 圆环 + 状态点） */}
      <div
        style={{
          pointerEvents: "auto",
          position: "relative",
          height: "100%",
          width: `${g.edgeWingWidth}px`,
        }}
      >
        <EdgeWingBackground width={g.edgeWingWidth} />
        <EdgeWingContent onClose={onClose} vm={vm} />
      </div>
    </div>
  );
}

/**
 * v23 弧形翼片背景（SVG path，向左展开包裹圆环+状态点）。
 *
 * v23 关键：path 控制点 X 用负值（向左超出列坐标系），让中段最左处 X≈15（列坐标）
 * = 643（主卡坐标），圆环左缘 655 完整在翼片内。
 *
 * SVG viewBox 扩大到包含负坐标（X 从 -20 开始），width 对应扩大，但 CSS 定位仍 right:0。
 */
function EdgeWingBackground({ width }: { width: number }): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  const w = width;
  const H = g.window.height;
  const ix = g.wingIndentX; // -10（向左超出）
  const ct = g.wingControlTop;
  const cb = g.wingControlBot;
  const wingPath = `M ${w} 0 C ${ix} ${ct}, ${ix} ${cb}, ${w} ${H} L ${w} 0 Z`;

  // viewBox 扩大到包含 ix（负值），让 SVG 不裁掉向左展开的部分
  const viewBoxMinX = Math.min(0, ix) - 10; // 留 10px 余量
  const viewBoxWidth = w - viewBoxMinX;

  return (
    <svg
      aria-hidden="true"
      width={viewBoxWidth}
      height={H}
      viewBox={`${viewBoxMinX} 0 ${viewBoxWidth} ${H}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <defs>
        {/* v26：渐变改用 wash token（light/dark 由 CSS var 解析），保留 stop-opacity 调亮度 */}
        <linearGradient id="wing-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--c-base-glass)" stopOpacity="0.58" />
          <stop offset="52%" stopColor="var(--c-blue-wash)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--c-violet-wash)" stopOpacity="0.52" />
        </linearGradient>
        {/* 高光边缘：玻璃白光，两主题均为白 */}
        <linearGradient id="wing-edge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="white" stopOpacity="0.7" />
          <stop offset="100%" stopColor="white" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path d={wingPath} fill="url(#wing-gradient)" />
      <path
        d={`M ${w} 0 C ${ix} ${ct}, ${ix} ${cb}, ${w} ${H}`}
        fill="none"
        stroke="url(#wing-edge)"
        strokeWidth="1.2"
      />
      <path
        d={wingPath}
        fill="none"
        stroke="var(--c-violet-wash)"
        strokeOpacity="0.15"
        strokeWidth="3"
        style={{ filter: "blur(2px)" }}
      />
    </svg>
  );
}

/**
 * v22 翼片内容（圆环 + 状态点，在 EdgeWing 列内绝对定位）。
 *
 * v22 关键：圆环水平中心 = EdgeWing 列宽的中点（在列内 left:50% translateX(-50%)）
 * v26：收起控件改为 native <button>（键盘可达 + no-drag + Enter/Space）。
 */
function EdgeWingContent({
  onClose,
  vm,
}: {
  onClose: () => void;
  vm: UsageViewModel;
}): React.ReactElement {
  const { t } = useTranslation();
  const g = SURFACE_GEOMETRY;

  const client = vm.client;
  let ringProgress: number | null = null;
  let health: Health = "unavailable";
  let miniPercentText = "—";
  if (client && client.kind === "codex") {
    const primary = client.primaryQuota;
    const secondary = client.secondaryQuota;
    const weeklyQuota =
      primary?.kind === "weekly" ? primary : secondary?.kind === "weekly" ? secondary : null;
    const fiveHourQuota =
      primary?.kind === "five-hour" ? primary : secondary?.kind === "five-hour" ? secondary : null;
    const mainQuota = weeklyQuota ?? fiveHourQuota;
    const pct = mainQuota?.remainingPercent ?? null;
    ringProgress = pct;
    health = mainQuota?.health ?? "unavailable";
    miniPercentText = pct === null ? "—" : `${Math.round(pct)}%`;
  }

  const ringSize = g.edgeRingFrame;

  // v26：native <button>，inherits no-drag from globals.css button{} 规则，
  // 自带 tabIndex=0 + Enter/Space→click。覆盖整列做点击收起区。
  return (
    <button
      type="button"
      aria-label={t("action.close")}
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        padding: 0,
        margin: 0,
        border: "none",
        borderRadius: 0,
        background: "transparent",
        cursor: "pointer",
        zIndex: 3,
      }}
    >
      {/* v24 圆环：left calc(50% + 8px) 让圆环向右微调 8px（翼片弧线中心偏右） */}
      <div
        style={{
          position: "absolute",
          left: "calc(50% + 8px)",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: `${ringSize}px`,
          height: `${ringSize}px`,
          pointerEvents: "none",
        }}
      >
        {client?.kind === "codex" ? (
          <>
            <ProgressRing
              size={g.edgeRingSize}
              progress={ringProgress}
              aria-label={t("quota.weekly")}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
              }}
            >
              <span style={{ ...miniPercentStyle(), margin: 0, padding: 0, transform: "none" }}>
                {miniPercentText}
              </span>
            </div>
          </>
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              border: "1px dashed var(--c-border)",
            }}
          />
        )}
      </div>
      {/* v24 状态点：left calc(50% + 8px) 与圆环保持同一垂直轴线 */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "calc(50% + 8px)",
          bottom: `${g.edgeStatusDotBottom}px`,
          transform: "translateX(-50%)",
          display: "inline-block",
          width: `${g.edgeStatusDotSize}px`,
          height: `${g.edgeStatusDotSize}px`,
          borderRadius: "50%",
          background: HEALTH_COLOR[health],
          boxShadow:
            "0 0 0 1.5px color-mix(in srgb, white 60%, transparent), 0 0 4px color-mix(in srgb, var(--c-success) 50%, transparent)",
          pointerEvents: "none",
        }}
      />
    </button>
  );
}

// ---------- Codex 主体 ----------

function CodexCapsuleBody({
  client,
  vm,
}: {
  client: ClientUsageViewModel;
  vm: UsageViewModel;
}): React.ReactElement {
  const { t, i18n } = useTranslation();
  const primary = client.primaryQuota;
  const secondary = client.secondaryQuota;

  const weeklyQuota: QuotaWindowViewModel | null =
    primary?.kind === "weekly" ? primary : secondary?.kind === "weekly" ? secondary : null;
  const fiveHourQuota: QuotaWindowViewModel | null =
    primary?.kind === "five-hour" ? primary : secondary?.kind === "five-hour" ? secondary : null;

  const mainQuota = weeklyQuota ?? fiveHourQuota;
  const mainPercent = mainQuota?.remainingPercent ?? null;
  const mainText = mainPercent === null ? "—" : `${Math.round(mainPercent)}%`;
  const ringProgress = mainQuota?.remainingPercent ?? null;

  const resetQuota = weeklyQuota ?? fiveHourQuota;
  const resetParts = resetQuota?.resetsAt
    ? computeCountdownParts({ resetsAt: resetQuota.resetsAt, now: vm.now })
    : null;
  const resetText = formatResetText(resetParts, i18n.language, t);

  const today = client.tokenUsage.today;
  const todayText = today !== null ? (formatToken(today) ?? "—") : "—";
  const updatedAt = t("footer.updatedAt", { time: formatUpdatedAt(vm.fetchedAt) });

  return (
    <>
      {/* 段 1：主额度区（CODEX·{PLAN} + 每周额度 + 64%+ring）。
          v26：删除重复「更新于」，只在今日 Token 下保留一次 */}
      <MainQuotaSection
        brand={formatCodexBrand(client.planType)}
        label={t("quota.weeklyAllowance")}
        value={mainText}
        ringProgress={ringProgress}
        ringLabel={t("quota.weekly")}
      />
      {/* 段 2：重置区（重置 + 倒计时 + 占位保持高度） */}
      <MetricSection label={t("quota.reset")} value={resetText} showDivider />
      {/* 段 3：今日 Token 区（今日 Token + 1.7M + 更新时间，唯一一处「更新于」） */}
      <TodaySection
        label={t("tray.todayToken")}
        value={todayText}
        updatedAt={updatedAt}
        showDivider
        hint={dataStateHint(vm.dataState, t)}
      />
    </>
  );
}

// ---------- ZCode 主体（红线：不渲染配额） ----------

function ZCodeCapsuleBody({
  client,
  vm,
}: {
  client: ClientUsageViewModel;
  vm: UsageViewModel;
}): React.ReactElement {
  const { t } = useTranslation();
  const today = client.tokenUsage.today;
  const lifetime = client.tokenUsage.lifetimeTotal;
  const modelName = client.tokenUsage.models[0]?.name ?? "—";
  const todayText = today !== null ? (formatToken(today) ?? "—") : "—";
  const lifetimeText = lifetime !== null ? (formatToken(lifetime) ?? "—") : "—";
  const updatedAt = t("footer.updatedAt", { time: formatUpdatedAt(vm.fetchedAt) });

  return (
    <>
      <MainQuotaSection
        brand={t("brand.zcode")}
        label={t("tray.today")}
        value={todayText}
        ringProgress={null}
      />
      <MetricSection label={t("tray.lifetime")} value={lifetimeText} showDivider />
      <TodaySection
        label={t("tray.models")}
        value={modelName}
        updatedAt={updatedAt}
        showDivider
        hint={dataStateHint(vm.dataState, t)}
      />
    </>
  );
}

// ---------- 局部组件 ----------

/**
 * v30：根据 dataState 返回状态提示。窄胶囊显示短文案，完整说明放 title。
 * refresh-error → danger 色 + footer.errorShort；stale → warning 色 + footer.stale。
 * 其余状态（fresh/partial/loading/offline）无提示。PRD §6.6/§7.1：刷新失败保留上次快照 + 一行短提示。
 */
function dataStateHint(
  dataState: DataState,
  t: ReturnType<typeof useTranslation>["t"],
): { state: DataState; text: string; title: string } | undefined {
  if (dataState === "refresh-error") {
    return { state: dataState, text: t("footer.errorShort"), title: t("footer.error") };
  }
  if (dataState === "stale") {
    return { state: dataState, text: t("footer.stale"), title: t("footer.stale") };
  }
  return undefined;
}

/** v25 分隔线元素（绝对定位，高度 120px，垂直居中在 section 内）。 */
function DividerLine(): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        top: "50%",
        transform: "translateY(-50%)",
        width: `${g.dividerWidth}px`,
        height: `${g.dividerHeight}px`,
        // v26：dividerColor 改用 var(--c-tertiary)，color-mix 调透明度
        background: `color-mix(in srgb, var(--c-tertiary) ${Math.round(g.dividerOpacity * 100)}%, transparent)`,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * v20 主额度区：4 行垂直结构（与重置/今日对齐）。
 * 行 1：CODEX · {PLAN}（顶部对齐其他模块标题位置）
 * 行 2：每周额度（标题）
 * 行 3：64% + 主 ring（主数据，水平容器，垂直居中）
 * 行 4：占位（v26 删除重复「更新于」，保留高度）
 */
function MainQuotaSection({
  brand,
  label,
  value,
  ringProgress,
  ringLabel,
}: {
  brand: string;
  label: string;
  value: string;
  ringProgress: number | null;
  ringLabel?: string;
}): React.ReactElement {
  const g = SURFACE_GEOMETRY;
  return (
    <section
      style={{
        position: "relative",
        display: "grid",
        gridTemplateRows: "20px 20px 40px 16px",
        rowGap: "4px",
        alignContent: "center",
        height: "100%",
        minWidth: 0,
        padding: "0 16px 0 0",
        boxSizing: "border-box",
      }}
    >
      <span style={brandStyle()}>{brand}</span>
      <span style={captionStyle()}>{label}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: `${g.mainPercentRingGap}px`,
          height: "40px",
        }}
      >
        <span style={displayStyle()}>{value}</span>
        {ringLabel !== undefined && (
          <div
            style={{
              position: "relative",
              width: g.mainRingFrame,
              height: g.mainRingFrame,
              flexShrink: 0,
            }}
          >
            <ProgressRing size={g.mainRingSize} progress={ringProgress} aria-label={ringLabel} />
          </div>
        )}
      </div>
      {/* v26：占位行保持高度，与重置/今日第 4 行对齐（不再显示「更新于」） */}
      <span style={{ ...captionSmStyle(), visibility: "hidden" }} aria-hidden="true">
        {"X"}
      </span>
    </section>
  );
}

/**
 * v20 重置区：4 行垂直结构（与主额度对齐，占位保持高度一致）。
 * **关键**：value span 用 white-space: nowrap + overflow: visible（不截断）。
 */
function MetricSection({
  label,
  value,
  showDivider = false,
}: {
  label: string;
  value: string;
  showDivider?: boolean;
}): React.ReactElement {
  return (
    <section
      style={{
        position: "relative",
        display: "grid",
        gridTemplateRows: "20px 20px 40px 16px",
        rowGap: "4px",
        alignContent: "center",
        height: "100%",
        minWidth: 0,
        padding: "0 16px",
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      {showDivider && <DividerLine />}
      <span style={brandPlaceholderStyle()} aria-hidden="true">
        {"X"}
      </span>
      <span style={captionStyle()}>{label}</span>
      <span style={{ ...metricLStyle(), height: "40px", overflow: "visible" }}>{value}</span>
      <span style={{ ...captionSmStyle(), visibility: "hidden" }}>{"X"}</span>
    </section>
  );
}

/** v20 今日 Token 区：4 行垂直结构。
 * v30：row4 在异常时用短状态替换更新时间，禁止追加长文案侵入 ActionRail。 */
function TodaySection({
  label,
  value,
  updatedAt,
  showDivider = false,
  hint,
}: {
  label: string;
  value: string;
  updatedAt: string;
  showDivider?: boolean;
  /** 状态提示（refresh-error → danger 色，stale → warning 色）。undefined 时不渲染。 */
  hint?: { state: DataState; text: string; title: string } | undefined;
}): React.ReactElement {
  return (
    <section
      style={{
        position: "relative",
        display: "grid",
        gridTemplateRows: "20px 20px 40px 16px",
        rowGap: "4px",
        alignContent: "center",
        height: "100%",
        minWidth: 0,
        padding: "0 16px",
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      {showDivider && <DividerLine />}
      <span style={brandPlaceholderStyle()} aria-hidden="true">
        {"X"}
      </span>
      <span style={captionStyle()}>{label}</span>
      <span style={{ ...metricLStyle(), height: "40px", overflow: "visible" }}>{value}</span>
      <span
        title={hint?.title}
        style={{
          ...captionSmStyle(),
          color:
            hint?.state === "refresh-error"
              ? "var(--c-danger)"
              : hint?.state === "stale"
                ? "var(--c-warning)"
                : "var(--c-tertiary)",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {hint?.text ?? updatedAt}
      </span>
    </section>
  );
}

/**
 * v22 ActionRail（3 个操作图标，独立玻璃背景）。
 * 由 RightControls 容器第 1 列承载，宽度 58px。
 * v26：复用 IconButton（size="rail" 40×40），自带 tooltip/hover/pressed/focus-visible/no-drag。
 */
function ActionRail({
  onSwitchClient,
  onRefresh,
  onCycleTheme,
  themePreference,
}: {
  onSwitchClient: () => void;
  onRefresh: () => void;
  onCycleTheme: () => void;
  themePreference: ThemePreference;
}): React.ReactElement {
  const { t } = useTranslation();
  const g = SURFACE_GEOMETRY;

  // v30 主题三态：图标随 preference 变化，用 Fluent System Icons SVG（visual-spec §图标语义）
  const themeIconName: FluentIconName =
    themePreference === "auto"
      ? "themeAuto"
      : themePreference === "light"
        ? "themeLight"
        : "themeDark";
  const themeIcon = <FluentIcon name={themeIconName} size={g.actionIconSize} />;
  const themeLabel =
    themePreference === "auto"
      ? t("action.themeAuto")
      : themePreference === "light"
        ? t("action.themeLight")
        : t("action.themeDark");

  return (
    <div
      style={{
        width: `${g.actionRailWidth}px`,
        height: `${g.actionRailHeight}px`,
        borderRadius: `${g.actionRailRadius}px`,
        padding: "10px 0",
        display: "grid",
        gridTemplateRows: "repeat(3, 1fr)",
        alignItems: "center",
        justifyItems: "center",
        background: "color-mix(in srgb, white 35%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid color-mix(in srgb, white 45%, transparent)",
        // v25：减弱外阴影（8%→4%，扩散 8px→4px），保留内高光 + 轻微悬浮感
        boxShadow:
          "inset 0 1px 0 color-mix(in srgb, white 55%, transparent), 0 1px 4px color-mix(in srgb, black 4%, transparent)",
        boxSizing: "border-box",
      }}
    >
      <IconButton size="rail" aria-label={t("action.switchClient")} onClick={onSwitchClient}>
        <FluentIcon name="switchClient" size={g.actionIconSize} />
      </IconButton>
      <IconButton size="rail" aria-label={t("action.refresh")} onClick={onRefresh}>
        <FluentIcon name="refresh" size={g.actionIconSize} />
      </IconButton>
      <IconButton size="rail" aria-label={themeLabel} onClick={onCycleTheme}>
        {themeIcon}
      </IconButton>
    </div>
  );
}

// ---------- 样式工厂 ----------
// v26：删除 inkColor/secondaryColor/tertiaryColor 函数，改用 CSS var（与 IconButton/ProgressRing 一致）。
// fontFamily/fontSize/lineHeight/fontWeight 全部从 typography token 读取。

/** v26 主百分比（displayS 34/700）。 */
function displayStyle(): React.CSSProperties {
  return {
    ...typography.displayS,
    fontSize: `${typography.displayS.fontSize}px`,
    lineHeight: `${typography.displayS.lineHeight}px`,
    color: "var(--c-ink)",
    fontVariantNumeric: "tabular-nums lining-nums",
    whiteSpace: "nowrap",
  };
}

/** v20 模块主数值（metricL 28/600）。
 * **关键**：whiteSpace:nowrap + overflow:visible + textOverflow:clip（不截断）。 */
function metricLStyle(): React.CSSProperties {
  return {
    ...typography.metricL,
    fontSize: `${typography.metricL.fontSize}px`,
    lineHeight: `${typography.metricL.lineHeight}px`,
    color: "var(--c-ink)",
    fontVariantNumeric: "tabular-nums lining-nums",
    whiteSpace: "nowrap",
    overflow: "visible",
    textOverflow: "clip",
  };
}

/** v25 产品与套餐（CODEX · {PLAN}）。
 * 加 display:block + minHeight:20px 与 brandPlaceholderStyle 完全一致，确保基线对齐。 */
function brandStyle(): React.CSSProperties {
  return {
    ...typography.labelL,
    fontSize: `${typography.labelL.fontSize}px`,
    lineHeight: `${typography.labelL.lineHeight}px`,
    color: "var(--c-ink)",
    whiteSpace: "nowrap",
    minHeight: "20px",
    display: "block",
  };
}

/** v25 brand 占位（保持重置/今日第一行高度与主额度对齐）。
 * 用 visibility:hidden + minHeight 确保占位行高度与实际 CODEX 文字一致。 */
function brandPlaceholderStyle(): React.CSSProperties {
  return {
    ...typography.labelL,
    fontSize: `${typography.labelL.fontSize}px`,
    lineHeight: `${typography.labelL.lineHeight}px`,
    color: "var(--c-ink)",
    whiteSpace: "nowrap",
    minHeight: "20px",
    display: "block",
    visibility: "hidden",
  };
}

function bodyTextStyle(overrides?: React.CSSProperties): React.CSSProperties {
  return {
    fontFamily: typography.body.fontFamily,
    fontSize: `${typography.body.fontSize}px`,
    lineHeight: `${typography.body.lineHeight}px`,
    fontWeight: 400,
    color: "var(--c-tertiary)",
    ...overrides,
  };
}

/** v20 模块标题（body 14/500，深蓝灰色）。 */
function captionStyle(): React.CSSProperties {
  return {
    ...typography.body,
    fontSize: `${typography.body.fontSize}px`,
    lineHeight: `${typography.body.lineHeight}px`,
    fontWeight: 500,
    color: "var(--c-secondary)",
    whiteSpace: "nowrap",
  };
}

/** v20 辅助信息（更新时间，caption 13/400，清晰可读）。 */
function captionSmStyle(): React.CSSProperties {
  return {
    ...typography.caption,
    fontSize: `${typography.caption.fontSize}px`,
    lineHeight: `${typography.caption.lineHeight}px`,
    fontWeight: 400,
    color: "var(--c-tertiary)",
    whiteSpace: "nowrap",
  };
}

/** v20 边缘胶囊迷你百分比（caption 13/700）。 */
function miniPercentStyle(): React.CSSProperties {
  return {
    ...typography.caption,
    fontSize: `${typography.caption.fontSize}px`,
    lineHeight: 1,
    fontWeight: 700,
    color: "var(--c-ink)",
    fontVariantNumeric: "tabular-nums lining-nums",
  };
}

/** ISO 时间 → HH:mm。 */
function formatUpdatedAt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** v20 重置时间文案：>=1 天显示"X天"，否则用 compact 格式。 */
function formatResetText(
  parts: ReturnType<typeof computeCountdownParts>,
  locale: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (parts === null) return t("quota.resetUnknown");
  const relevant = pickRelevantParts(parts);
  void locale;
  if (relevant.days !== undefined && relevant.days >= 1) {
    return t("quota.daysLater", { n: relevant.days });
  }
  if (relevant.hours !== undefined && relevant.minutes !== undefined) {
    return t("quota.hoursMinutesLater", { h: relevant.hours, m: relevant.minutes });
  }
  if (relevant.minutes !== undefined) {
    return t("quota.minutesLater", { m: relevant.minutes });
  }
  return t("quota.resetUnknown");
}
