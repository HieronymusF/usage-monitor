/**
 * CSS 颜色变量 + @theme 映射防漂移测试（P1-8）。
 *
 * 验证：
 * 1. design-tokens.json §color.light/dark 的每个颜色，都在 globals.css 的
 *    :root/.light 和 .dark 块里有对应的 --c-<name> 变量，且值一致。
 * 2. globals.css 的 @theme 块把所有语义颜色映射成 --color-* token（bg-primary 等可用）。
 *
 * 防止"改了 JSON 忘改 CSS"或"@theme 漏映射"导致组件颜色失真。
 *
 * 纯字符串解析（不依赖 jsdom），可独立运行。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = join(import.meta.dirname, "..", "..");
const tokensJson = JSON.parse(
  readFileSync(join(root, "docs", "ui-designs", "design-tokens.json"), "utf8"),
) as {
  color: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
};
const css = readFileSync(join(root, "renderer", "src", "styles", "globals.css"), "utf8");

// JSON key（camelCase）→ CSS variable name（kebab-case）
function toCssVarName(jsonKey: string): string {
  // accentStart → accent-start，baseGlass → base-glass
  return `--c-${jsonKey.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

test("CSS 防漂移: design-tokens.json §color.light 每个颜色都在 globals.css :root/.light 块", () => {
  const lightBlock = extractBlock(css, /:root,\s*\.light\s*\{([^}]*)\}/);
  assert.ok(lightBlock, "应找到 :root, .light 块");
  for (const [jsonKey, jsonValue] of Object.entries(tokensJson.color.light)) {
    const varName = toCssVarName(jsonKey);
    // hex 大小写不敏感（JSON 大写 #566B82，CSS 小写 #566b82，值等价）
    const re = new RegExp(`${escapeRegExp(varName)}:\\s*${escapeRegExp(jsonValue)};`, "i");
    assert.ok(re.test(lightBlock), `light.${jsonKey}: CSS 缺 ${varName}: ${jsonValue}，或值漂移`);
  }
});

test("CSS 防漂移: design-tokens.json §color.dark 每个颜色都在 globals.css .dark 块", () => {
  const darkBlock = extractBlock(css, /\.dark\s*\{([^}]*)\}/);
  assert.ok(darkBlock, "应找到 .dark 块");
  for (const [jsonKey, jsonValue] of Object.entries(tokensJson.color.dark)) {
    const varName = toCssVarName(jsonKey);
    const re = new RegExp(`${escapeRegExp(varName)}:\\s*${escapeRegExp(jsonValue)};`, "i");
    assert.ok(re.test(darkBlock), `dark.${jsonKey}: CSS 缺 ${varName}: ${jsonValue}，或值漂移`);
  }
});

test("CSS 防漂移: @theme 块把语义颜色映射成 --color-* token", () => {
  const themeBlock = extractBlock(css, /@theme\s*\{([^}]*)\}/);
  assert.ok(themeBlock, "应找到 @theme 块");
  // 关键映射：组件里用 bg-primary / text-ink / border-border 等
  const requiredMappings: Array<{ color: string; source: string }> = [
    { color: "ink", source: "var(--c-ink)" },
    { color: "primary", source: "var(--c-accent-start)" },
    { color: "accent-start", source: "var(--c-accent-start)" },
    { color: "accent-end", source: "var(--c-accent-end)" },
    { color: "success", source: "var(--c-success)" },
    { color: "warning", source: "var(--c-warning)" },
    { color: "danger", source: "var(--c-danger)" },
    { color: "rail", source: "var(--c-rail)" },
    { color: "border", source: "var(--c-border)" },
    { color: "base-glass", source: "var(--c-base-glass)" },
  ];
  for (const { color, source } of requiredMappings) {
    const re = new RegExp(`--color-${color}:\\s*${escapeRegExp(source)};`);
    assert.ok(
      re.test(themeBlock),
      `@theme 缺 --color-${color}: ${source}（bg-${color}/text-${color} 将无法解析）`,
    );
  }
});

test("CSS 防漂移: 颜色值用 8 位 hex（含 alpha）或 6 位 hex", () => {
  // design-tokens.json 的玻璃颜色含 alpha（如 #F8FCFFE6）
  // 验证 light+dark 所有颜色都是合法 hex
  for (const theme of ["light", "dark"] as const) {
    for (const [key, value] of Object.entries(tokensJson.color[theme])) {
      assert.match(
        value,
        /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/,
        `${theme}.${key}=${value} 不是合法 hex（6 或 8 位）`,
      );
    }
  }
});

test("CSS 防漂移: light 与 dark 有相同的颜色 key 集合", () => {
  const lightKeys = Object.keys(tokensJson.color.light).sort();
  const darkKeys = Object.keys(tokensJson.color.dark).sort();
  assert.deepEqual(lightKeys, darkKeys, "light/dark 颜色 key 必须对称");
});

// ---------- 辅助函数 ----------

function extractBlock(css: string, pattern: RegExp): string | null {
  const match = css.match(pattern);
  return match?.[1] ?? null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
