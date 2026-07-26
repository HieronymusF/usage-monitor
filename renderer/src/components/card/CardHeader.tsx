/**
 * CardHeader — 标题栏（visual-spec §3 + §4.4）。
 *
 * 结构：
 * - 左：品牌 "CODEX · {PLAN}"（labelL 16/24 SemiBold）+ 客户端切换按钮
 * - 右：3 个 36×36 IconButton（主题 / 展示模式 / 关闭），间距 8px
 *
 * 红线（visual-spec §3 L111）：标题栏不得出现额度状态灯、连接状态灯、`中`字、
 * 语言切换图标、macOS 交通灯。本组件严格遵守。
 *
 * 客户端切换：Milestone C 只做 Codex Card，但切换器存在（切 ZCode 时由 CodexCard
 * 显示占位说明）。
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClientKind } from "../../domain/types";
import type { DisplayPreference } from "../../../../shared/desktop";
import { formatCodexBrand } from "../../domain/usage-view-model";
import { FluentIcon, type FluentIconName } from "../foundations/FluentIcon";
import { IconButton } from "../foundations/IconButton";
import { useDisplayStore } from "../../stores/displayStore";
import { useThemeStore } from "../../stores/themeStore";
import { useUsageStore } from "../../stores/usageStore";
import { radius, spacing, surfaceSizes, typography } from "../../styles/tokens";

const DISPLAY_PREFERENCES: readonly DisplayPreference[] = ["auto", "card", "indicator-bar", "orb"];

const DISPLAY_LABEL_KEYS = {
  auto: "tray.menu.displayAuto",
  card: "tray.menu.displayCard",
  "indicator-bar": "tray.menu.displayBar",
  orb: "tray.menu.displayOrb",
} as const satisfies Record<DisplayPreference, string>;

const THEME_CYCLE = ["auto", "light", "dark"] as const;

export interface CardHeaderProps {
  clientKind: ClientKind;
  planType?: string | null;
  onSwitchClient: (kind: ClientKind) => void;
  onClose: () => void;
}

export function CardHeader({
  clientKind,
  planType = null,
  onSwitchClient,
  onClose,
}: CardHeaderProps): React.ReactElement {
  const { t } = useTranslation();
  const themePreference = useThemeStore((s) => s.preference);
  const setThemePreference = useThemeStore((s) => s.setPreference);
  const displayPreference = useDisplayStore((s) => s.displayPreference);
  const setDisplayPreference = useDisplayStore((s) => s.setPreference);
  const setActiveClient = useUsageStore((s) => s.setActiveClient);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);

  const brand = clientKind === "codex" ? formatCodexBrand(planType) : t("brand.zcode");

  const cycleTheme = (): void => {
    const currentIndex = THEME_CYCLE.indexOf(themePreference);
    setThemePreference(THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length]!);
  };

  const themeIconName: FluentIconName =
    themePreference === "auto"
      ? "themeAuto"
      : themePreference === "light"
        ? "themeLight"
        : "themeDark";
  const themeLabel =
    themePreference === "auto"
      ? t("action.themeAuto")
      : themePreference === "light"
        ? t("action.themeLight")
        : t("action.themeDark");

  const switchToClient = (kind: ClientKind): void => {
    setActiveClient(kind);
    onSwitchClient(kind);
    setClientMenuOpen(false);
  };

  const switchDisplayMode = (preference: DisplayPreference): void => {
    setDisplayPreference(preference);
    setDisplayMenuOpen(false);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "36px",
      }}
    >
      {/* 左：品牌 + 客户端切换 */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
        <span
          style={{
            fontFamily: '"Segoe UI Variable Text", "Microsoft YaHei UI", "Segoe UI", sans-serif',
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: 600,
            color: "var(--c-ink)",
            letterSpacing: "0",
          }}
        >
          {brand}
        </span>
        <button
          type="button"
          aria-label={t("action.switchClient")}
          title={t("action.switchClient")}
          onClick={() => setClientMenuOpen((v) => !v)}
          style={
            {
              display: "flex",
              alignItems: "center",
              gap: "2px",
              background: "transparent",
              border: "none",
              padding: "4px",
              cursor: "pointer",
              color: "var(--c-tertiary)",
              borderRadius: "6px",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }
        >
          <FluentIcon name="chevronDown" size={16} />
        </button>
        {clientMenuOpen ? (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: "4px",
              padding: "4px",
              borderRadius: "12px",
              background: "var(--c-base-glass)",
              border: "1px solid var(--c-border)",
              boxShadow: "var(--shadow-small)",
              zIndex: 100,
              minWidth: "120px",
            }}
          >
            {(["codex", "zcode"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="menuitemradio"
                aria-checked={clientKind === k}
                onClick={() => switchToClient(k)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background:
                    clientKind === k
                      ? "color-mix(in srgb, var(--c-accent-start) 18%, transparent)"
                      : "transparent",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  color: "var(--c-ink)",
                  fontSize: "13px",
                }}
              >
                {k === "codex" ? "Codex" : "ZCode"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* 右：3 按钮（主题/模式/关闭）。 */}
      <div style={{ display: "flex", gap: "8px" }}>
        <IconButton size="card" aria-label={themeLabel} onClick={cycleTheme}>
          <FluentIcon name={themeIconName} size={16} />
        </IconButton>
        <div
          style={{ position: "relative" }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setDisplayMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDisplayMenuOpen(false);
          }}
        >
          <IconButton
            size="card"
            aria-label={t("action.switchMode")}
            aria-haspopup="menu"
            aria-expanded={displayMenuOpen}
            onClick={() => setDisplayMenuOpen((open) => !open)}
          >
            <FluentIcon name="displayMode" size={16} />
          </IconButton>
          {displayMenuOpen ? (
            <div
              role="menu"
              aria-label={t("tray.menu.displayMode")}
              style={{
                position: "absolute",
                top: `${surfaceSizes.iconButton.card + spacing["1"]}px`,
                right: 0,
                minWidth: "max-content",
                padding: `${spacing["0_5"]}px`,
                borderRadius: `${radius.button30}px`,
                background: "var(--c-base-glass)",
                border: "1px solid var(--c-border)",
                boxShadow: "var(--shadow-small)",
                zIndex: 100,
              }}
            >
              {DISPLAY_PREFERENCES.map((preference) => {
                const selected = displayPreference === preference;
                return (
                  <button
                    key={preference}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => switchDisplayMode(preference)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: `${spacing["1"]}px`,
                      width: "100%",
                      padding: `${spacing["1"]}px ${spacing["1_5"]}px`,
                      background: selected
                        ? "color-mix(in srgb, var(--c-accent-start) 18%, transparent)"
                        : "transparent",
                      border: "none",
                      borderRadius: `${radius.button30}px`,
                      cursor: "pointer",
                      color: "var(--c-ink)",
                      fontFamily: typography.caption.fontFamily,
                      fontSize: `${typography.caption.fontSize}px`,
                      lineHeight: `${typography.caption.lineHeight}px`,
                      fontWeight: typography.caption.fontWeight,
                      whiteSpace: "nowrap",
                      textAlign: "left",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: selected ? "var(--c-accent-start)" : "transparent",
                        flexShrink: 0,
                      }}
                    />
                    {t(DISPLAY_LABEL_KEYS[preference])}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <IconButton size="card" aria-label={t("action.close")} onClick={onClose}>
          <FluentIcon name="close" size={16} />
        </IconButton>
      </div>
    </div>
  );
}
