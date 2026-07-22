/**
 * CardFooter — 更新时间 + stale/error 提示（visual-spec §1 caption）。
 *
 * dataState:
 * - fresh: "更新于 HH:mm"
 * - stale: "更新于 HH:mm" + 灰色"数据可能已过期"
 * - refresh-error: "更新于 HH:mm" + "刷新失败 — 显示上次数据"
 * - partial: 同 fresh（额外 warning 由 Card 端处理）
 * - loading/offline: 对应占位（Card 已显示其他状态，footer 隐藏）
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { DataState } from "../../domain/types";

export interface CardFooterProps {
  fetchedAt: string;
  dataState: DataState;
}

export function CardFooter({ fetchedAt, dataState }: CardFooterProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (dataState === "loading" || dataState === "offline") return null;

  const time = formatTime(fetchedAt);
  const stale = dataState === "stale";
  const error = dataState === "refresh-error";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "13px",
        lineHeight: "19px",
        color: "var(--c-tertiary)",
      }}
    >
      <span>{t("footer.updatedAt", { time })}</span>
      {stale ? <span style={{ color: "var(--c-warning)" }}>· {t("footer.stale")}</span> : null}
      {error ? <span style={{ color: "var(--c-danger)" }}>· {t("footer.error")}</span> : null}
    </div>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  // 本地 HH:mm
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
