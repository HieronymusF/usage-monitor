#!/usr/bin/env node
/**
 * capture.mjs — 单态截图入口。
 *
 * 用法：
 *   node scripts/capture.mjs <preview>                              # 默认 surface=card theme=light scale=1
 *   node scripts/capture.mjs <preview> --surface <kind>             # 指定 surface
 *   node scripts/capture.mjs <preview> --surface edge-capsule --theme dark   # 深色主题
 *   node scripts/capture.mjs <preview> --surface edge-capsule --scale 2       # 200% DPI
 *
 * preview ∈ {dual, weekly-only, five-only, no-quota, zcode-local, zcode-no-data}
 * surface ∈ {card, indicator-bar, orb, edge-capsule}
 * theme   ∈ {light, dark}（默认 light）
 * scale   ∈ {1, 1.25, 1.5, 2}（默认 1；用 device emulation 模拟 DPI 缩放）
 *
 * 行为：
 * 1. 设置 CARD_PREVIEW + SURFACE + CAPTURE_PREVIEW=1 + CAPTURE_THEME + CAPTURE_SCALE
 * 2. spawn `npm run dev`
 * 3. main.ts captureAndQuit 分支截窗口 PNG 后 app.quit()
 * 4. PNG 在 docs/ui-designs/_actual/<surface>-<preview>[-theme][-scale].png
 *
 * 这是工具脚本，不是测试。靠 main process log 的 [capture] wrote 确认成功。
 * Electron 单实例锁限制：不能同时跑两个 capture 进程。
 */

import { spawn } from "node:child_process";

const PREVIEWS = [
  "dual",
  "weekly-only",
  "five-only",
  "no-quota",
  "zcode-local",
  "zcode-no-data",
];
const SURFACES = ["card", "indicator-bar", "orb", "edge-capsule"];
const THEMES = ["light", "dark"];
const SCALES = ["1", "1.25", "1.5", "2"];

function parseArgs(argv) {
  const preview = argv[2];
  let surface = "card";
  let theme = "light";
  let scale = "1";

  const surfaceIdx = argv.indexOf("--surface");
  if (surfaceIdx >= 0 && argv[surfaceIdx + 1]) {
    surface = argv[surfaceIdx + 1];
  }
  const themeIdx = argv.indexOf("--theme");
  if (themeIdx >= 0 && argv[themeIdx + 1]) {
    theme = argv[themeIdx + 1];
  }
  const scaleIdx = argv.indexOf("--scale");
  if (scaleIdx >= 0 && argv[scaleIdx + 1]) {
    scale = argv[scaleIdx + 1];
  }
  return { preview, surface, theme, scale };
}

const { preview, surface, theme, scale } = parseArgs(process.argv);
if (!preview || !PREVIEWS.includes(preview)) {
  console.error(`Usage: node scripts/capture.mjs <preview> [--surface <kind>] [--theme light|dark] [--scale 1|1.25|1.5|2]`);
  console.error(`  preview ∈ {${PREVIEWS.join(", ")}}`);
  console.error(`  surface ∈ {${SURFACES.join(", ")}}（默认 card）`);
  console.error(`  theme   ∈ {${THEMES.join(", ")}}（默认 light）`);
  console.error(`  scale   ∈ {${SCALES.join(", ")}}（默认 1）`);
  process.exit(2);
}
if (!SURFACES.includes(surface)) {
  console.error(`Unknown surface: ${surface}. ∈ {${SURFACES.join(", ")}}`);
  process.exit(2);
}
if (!THEMES.includes(theme)) {
  console.error(`Unknown theme: ${theme}. ∈ {${THEMES.join(", ")}}`);
  process.exit(2);
}
if (!SCALES.includes(scale)) {
  console.error(`Unknown scale: ${scale}. ∈ {${SCALES.join(", ")}}`);
  process.exit(2);
}

// 输出文件名：card 省略前缀（向后兼容），其他 surface 加前缀。
// theme/scale 非 default 时加后缀，方便多矩阵共存。
const parts = [surface === "card" ? "" : surface, preview];
if (theme !== "light") parts.push(theme);
const scaleSuffix = scale === "1" ? "" : scale.replace(".", "");
if (scaleSuffix) parts.push(scaleSuffix);
const outputName = parts.filter(Boolean).join("-");

console.log(`[capture.mjs] capturing surface=${surface} preview=${preview} theme=${theme} scale=${scale} → ${outputName}.png`);

const child = spawn("npm", ["run", "dev"], {
  env: {
    ...process.env,
    CARD_PREVIEW: preview,
    SURFACE: surface,
    CAPTURE_PREVIEW: "1",
    CAPTURE_THEME: theme,
    CAPTURE_SCALE: scale,
    // main.ts 用 CARD_PREVIEW 推导输出文件名；这里通过 env 注入实际输出名（main.ts 优先用 CAPTURE_OUTPUT_NAME）
    CAPTURE_OUTPUT_NAME: outputName,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (code === 0) {
    console.log(`[capture.mjs] ${outputName} done (look at docs/ui-designs/_actual/${outputName}.png)`);
  } else {
    console.error(`[capture.mjs] ${outputName} failed: exit=${code} signal=${signal}`);
    process.exit(code ?? 1);
  }
});

child.on("error", (err) => {
  console.error(`[capture.mjs] spawn error:`, err);
  process.exit(1);
});
