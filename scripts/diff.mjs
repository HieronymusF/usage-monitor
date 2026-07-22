#!/usr/bin/env node
/**
 * diff.mjs — 像素 diff 工具。
 *
 * 两种用法：
 *
 * 1. 建立基线（"冻结当前实现"为参考）：
 *    node scripts/diff.mjs baseline
 *    把 docs/ui-designs/_actual/*.png 复制到 docs/ui-designs/_baseline/。
 *    基线入 git（不 gitignore），后续改动对比它。
 *
 * 2. 跑 diff（实现 vs 基线，同尺寸 576×404）：
 *    node scripts/diff.mjs [preview]
 *    - 不传 preview：对全部 actual/*.png vs baseline/*.png 跑 pixelmatch
 *    - 传 preview：只 diff 一个
 *    输出 _diff/<preview>.png（红色高亮不匹配像素）+ 终端报告不匹配像素数。
 *
 * 为什么不做"实现 vs 设计稿矩阵图" diff：
 *   docs/ui-designs/01-card-states-light.png 是 1672×941 矩阵图（一张含多个状态），
 *   尺寸和布局都与实现单图 576×404 完全不同，pixelmatch 要求两图同尺寸。
 *   手动裁剪 bounding box 误差大，diff 数失真。所以：
 *   - 实现 vs 实现 → 用本工具（精确）
 *   - 实现 vs 设计稿 → 人眼对比 actual/*.png 和 docs/ui-designs/01-05*.png
 */

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import PNG from "pngjs";
const { PNG: PNGClass } = PNG;
const require = createRequire(import.meta.url);
const pixelmatch = require("pixelmatch");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ACTUAL_DIR = join(ROOT, "docs/ui-designs/_actual");
const BASELINE_DIR = join(ROOT, "docs/ui-designs/_baseline");
const DIFF_DIR = join(ROOT, "docs/ui-designs/_diff");

const THRESHOLD = 0.1; // pixelmatch 颜色阈值（0-1），0.1 = 较严格
const DIFF_COLOR_R = 255; // 不匹配像素高亮红色
const DIFF_COLOR_G = 0;
const DIFF_COLOR_B = 0;

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function pathExists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

/** 把 actual/*.png 复制到 baseline/（覆盖）。 */
async function makeBaseline() {
  await ensureDir(BASELINE_DIR);
  if (!(await pathExists(ACTUAL_DIR))) {
    console.error(`[diff] ${ACTUAL_DIR} 不存在；先跑 npm run capture:all`);
    process.exit(1);
  }
  const files = (await readdir(ACTUAL_DIR)).filter((f) => f.endsWith(".png"));
  for (const f of files) {
    await copyFile(join(ACTUAL_DIR, f), join(BASELINE_DIR, f));
    console.log(`[diff] baseline ← ${f}`);
  }
  console.log(`[diff] baseline 建立完成：${files.length} 张`);
}

/** 对一个 preview 跑 pixelmatch。返回不匹配像素数，0 表示完全一致。 */
async function diffOne(preview) {
  const actualPath = join(ACTUAL_DIR, `${preview}.png`);
  const baselinePath = join(BASELINE_DIR, `${preview}.png`);
  try {
    const actualBuf = await readFile(actualPath);
    const baselineBuf = await readFile(baselinePath);
    const actual = PNGClass.sync.read(actualBuf);
    const baseline = PNGClass.sync.read(baselineBuf);
    if (actual.width !== baseline.width || actual.height !== baseline.height) {
      console.error(
        `[diff] ${preview}: 尺寸不一致 actual=${actual.width}x${actual.height} baseline=${baseline.width}x${baseline.height}`,
      );
      return -1;
    }
    const { width, height } = actual;
    const diff = new PNGClass({ width, height });
    const diffPixels = pixelmatch(
      actual.data,
      baseline.data,
      diff.data,
      width,
      height,
      { threshold: THRESHOLD, diffColor: [DIFF_COLOR_R, DIFF_COLOR_G, DIFF_COLOR_B] },
    );
    await ensureDir(DIFF_DIR);
    await writeFile(join(DIFF_DIR, `${preview}.png`), PNGClass.sync.write(diff));
    return diffPixels;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`[diff] ${preview}: 缺 actual 或 baseline 文件（${err.path}）`);
      return -1;
    }
    throw err;
  }
}

async function main() {
  const arg = process.argv[2];

  if (arg === "baseline") {
    await makeBaseline();
    return;
  }

  if (!arg) {
    if (!(await pathExists(BASELINE_DIR))) {
      console.error(`[diff] 没有 baseline。先跑：node scripts/diff.mjs baseline`);
      process.exit(1);
    }
    const files = (await readdir(BASELINE_DIR)).filter((f) => f.endsWith(".png"));
    const previews = files.map((f) => f.replace(/\.png$/, ""));
    let totalDiff = 0;
    for (const p of previews) {
      const n = await diffOne(p);
      if (n < 0) continue;
      const total = 576 * 404; // 近似总像素（实际尺寸看 actual）
      const pct = ((n / total) * 100).toFixed(2);
      console.log(`[diff] ${p}: ${n} 像素不同 (~${pct}%)`);
      totalDiff += n;
    }
    console.log(`[diff] 总计 ${totalDiff} 像素不同 across ${previews.length} 张`);
    return;
  }

  // 单个 preview
  const n = await diffOne(arg);
  if (n >= 0) {
    const total = 576 * 404;
    const pct = ((n / total) * 100).toFixed(2);
    console.log(`[diff] ${arg}: ${n} 像素不同 (~${pct}%)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
