#!/usr/bin/env node
/**
 * capture-all.mjs — 顺序截全部 6 个 preview。
 *
 * 用法：node scripts/capture-all.mjs
 *
 * 顺序跑（Electron 单实例锁不能并行），每态独立 spawn npm run dev。
 * 失败一态不阻断后续（继续跑剩下的），最后报失败列表。
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

/**
 * 跑一次 capture，返回是否成功（看 [capture] wrote 输出 + exit code）。
 * 等价于 `node scripts/capture.mjs <preview>`，但内联以收集 stdout。
 */
function captureOne(preview) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "dev"], {
      env: {
        ...process.env,
        CARD_PREVIEW: preview,
        CAPTURE_PREVIEW: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let sawCaptureLog = false;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (text.includes("[capture] wrote")) sawCaptureLog = true;
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk.toString());
    });
    child.on("exit", (code) => {
      resolve({ preview, ok: code === 0 && sawCaptureLog, code });
    });
    child.on("error", () => resolve({ preview, ok: false, code: -1 }));
  });
}

const failures = [];
for (const preview of PREVIEWS) {
  console.log(`\n========== capture ${preview} ==========`);
  const result = await captureOne(preview);
  if (!result.ok) failures.push(result);
}

console.log("\n========== summary ==========");
if (failures.length === 0) {
  console.log(`all ${PREVIEWS.length} previews captured to docs/ui-designs/_actual/`);
  process.exit(0);
} else {
  console.error(`failed: ${failures.map((f) => f.preview).join(", ")}`);
  failures.forEach((f) => console.error(`  ${f.preview}: exit=${f.code}`));
  process.exit(1);
}
