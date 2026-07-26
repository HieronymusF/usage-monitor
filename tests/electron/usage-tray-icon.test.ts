import test from "node:test";
import assert from "node:assert/strict";

import {
  renderUsageTrayIconPng,
  renderUsageTrayIconRgba,
  selectTrayRemainingPercent,
} from "../../electron/tray/usage-icon";
import type { MultiClientSnapshot, QuotaWindow } from "../../server/types";

function quota(windowMinutes: number, remainingPercent: number | null): QuotaWindow {
  return {
    id: String(windowMinutes),
    label: String(windowMinutes),
    windowMinutes,
    usedPercent: remainingPercent === null ? null : 100 - remainingPercent,
    remainingPercent,
    resetsAt: null,
    source: "app_server",
    quality: remainingPercent === null ? "unavailable" : "official",
  };
}

function snapshot(limits: QuotaWindow[]): MultiClientSnapshot {
  return {
    schemaVersion: 2,
    fetchedAt: "2026-07-26T03:17:00.000Z",
    staleAfter: "2026-07-26T03:18:00.000Z",
    clients: {
      codex: {
        clientId: "codex",
        displayName: "Codex",
        available: true,
        fetchedAt: "2026-07-26T03:17:00.000Z",
        staleAfter: "2026-07-26T03:18:00.000Z",
        planType: "pro",
        billingMode: "subscription",
        limits,
        tokenUsage: {
          input: null,
          cachedInput: null,
          output: null,
          reasoningOutput: null,
          total: null,
          lifetimeTotal: null,
          daily: null,
          source: "none",
          quality: "unavailable",
        },
        models: null,
        warnings: [],
      },
    },
    warnings: [],
  };
}

test("托盘额度优先周额度，缺失时回退 5h；ZCode 不虚构配额", () => {
  assert.equal(
    selectTrayRemainingPercent(snapshot([quota(300, 12), quota(10_080, 99)]), "codex"),
    99,
  );
  assert.equal(selectTrayRemainingPercent(snapshot([quota(300, 42)]), "codex"), 42);
  assert.equal(selectTrayRemainingPercent(snapshot([quota(10_080, null)]), "codex"), null);
  assert.equal(selectTrayRemainingPercent(snapshot([quota(10_080, 99)]), "zcode"), null);
});

test("托盘额度只接受有限数值并钳制到 0–100", () => {
  assert.equal(selectTrayRemainingPercent(snapshot([quota(10_080, -5)]), "codex"), 0);
  assert.equal(selectTrayRemainingPercent(snapshot([quota(10_080, 120)]), "codex"), 100);
  assert.equal(selectTrayRemainingPercent(snapshot([quota(10_080, Number.NaN)]), "codex"), null);
});

function countBluePixels(rgba: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index] ?? 0;
    const green = rgba[index + 1] ?? 0;
    const blue = rgba[index + 2] ?? 0;
    const alpha = rgba[index + 3] ?? 0;
    if (alpha > 96 && blue > 200 && green > 120 && blue - red > 35) count += 1;
  }
  return count;
}

test("动态托盘弧长随 10% → 80% → 99% 单调增加；无额度不画蓝弧", () => {
  const none = countBluePixels(renderUsageTrayIconRgba(null, 32));
  const zero = countBluePixels(renderUsageTrayIconRgba(0, 32));
  const ten = countBluePixels(renderUsageTrayIconRgba(10, 32));
  const eighty = countBluePixels(renderUsageTrayIconRgba(80, 32));
  const ninetyNine = countBluePixels(renderUsageTrayIconRgba(99, 32));

  assert.equal(none, 0);
  assert.equal(zero, 0);
  assert.ok(ten > none);
  assert.ok(eighty > ten);
  assert.ok(ninetyNine > eighty);
});

test("动态托盘输出有效 32×32 RGBA PNG", () => {
  const png = renderUsageTrayIconPng(99, 32);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
  assert.equal(png.readUInt8(24), 8, "bit depth");
  assert.equal(png.readUInt8(25), 6, "RGBA color type");
});
