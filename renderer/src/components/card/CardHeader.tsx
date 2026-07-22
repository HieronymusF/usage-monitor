/**
 * CardHeader — 标题栏（visual-spec §3 + §4.4）。
 *
 * 结构：
 * - 左：品牌 "CODEX · PLUS"（labelL 16/24 SemiBold）+ 客户端切换按钮
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
import { ChevronDown, Moon, Sun, X } from "lucide-react";
import type { ClientKind } from "../../domain/types";
import { IconButton } from "../foundations/IconButton";
import { useThemeStore } from "../../stores/themeStore";
import { useUsageStore } from "../../stores/usageStore";

export interface CardHeaderProps {
  clientKind: ClientKind;
  onSwitchClient: (kind: ClientKind) => void;
  onClose: () => void;
}

export function CardHeader({
  clientKind,
  onSwitchClient,
  onClose,
}: CardHeaderProps): React.ReactElement {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const setThemePreference = useThemeStore((s) => s.setPreference);
  const setActiveClient = useUsageStore((s) => s.setActiveClient);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);

  const brand = clientKind === "codex" ? t("brand.codex") : t("brand.zcode");

  const toggleTheme = (): void => {
    setThemePreference(resolvedTheme === "dark" ? "light" : "dark");
  };

  const switchToClient = (kind: ClientKind): void => {
    setActiveClient(kind);
    onSwitchClient(kind);
    setClientMenuOpen(false);
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
          <ChevronDown size={14} aria-hidden="true" />
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

      {/* 右：3 按钮（主题/模式/关闭）。模式切换 Milestone C 暂不实现功能,留按钮 */}
      <div style={{ display: "flex", gap: "8px" }}>
        <IconButton size="card" aria-label={t("action.switchTheme")} onClick={toggleTheme}>
          {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
        <IconButton
          size="card"
          aria-label={t("action.switchMode")}
          onClick={() => undefined}
          disabled
        >
          <span style={{ fontSize: "10px", fontWeight: 700 }}>2×2</span>
        </IconButton>
        <IconButton size="card" aria-label={t("action.close")} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  );
}
