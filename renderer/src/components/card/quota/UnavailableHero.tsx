/**
 * UnavailableHero — Codex NoQuota 左侧主区（visual-spec §5）。
 *
 * 配额完全缺失时显示"配额 — 服务未提供"。不显示 0%/100%/估算值（红线）。
 * WPF 对应 HeroUnavailablePanel。
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { StatusLabel } from "../../foundations/StatusLabel";

export function UnavailableHero(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "340px" }}>
      <div
        style={{
          fontFamily: '"Segoe UI Variable Text", "Microsoft YaHei UI", "Segoe UI", sans-serif',
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: 600,
          color: "var(--c-ink)",
        }}
      >
        {t("quota.unavailable")}
      </div>
      <StatusLabel status="unavailable" label={t("health.unavailable")} dotSize={8} />
    </div>
  );
}
