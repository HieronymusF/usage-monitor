/**
 * shared/settings 校验纯函数测试（Milestone E-F/G 设置持久化）。
 *
 * 覆盖五类输入（纪律 F）：正常值 / null / 空对象 / 非法值 / 部分字段。
 * 纯函数不碰 IO，CI 安全。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSettings,
  normalizePreference,
  resolveLanguageFromLocale,
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  type PreferenceKey,
} from "../../shared/settings";
import { createDefaultWindowPlacements } from "../../shared/window-placement";

// ─── validateSettings ───

test("validateSettings: 完整合法对象 → 原样保留", () => {
  const input = {
    version: SETTINGS_VERSION,
    themePreference: "dark",
    displayPreference: "orb",
    activeClient: "zcode",
    language: "en",
    autoLaunch: true,
    windowPlacements: {
      ...createDefaultWindowPlacements(),
      orb: { displayId: "2", offsetX: 6, offsetY: 240, snapEdge: "left" },
    },
  };
  assert.deepEqual(validateSettings(input), {
    version: SETTINGS_VERSION,
    themePreference: "dark",
    displayPreference: "orb",
    activeClient: "zcode",
    language: "en",
    autoLaunch: true,
    windowPlacements: {
      ...createDefaultWindowPlacements(),
      orb: { displayId: "2", offsetX: 6, offsetY: 240, snapEdge: "left" },
    },
  });
});

test("validateSettings: null / undefined / 非对象 → 默认", () => {
  assert.deepEqual(validateSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings("not an object"), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings(42), DEFAULT_SETTINGS);
});

test("validateSettings: 数组 → 默认（数组不是合法 settings 对象）", () => {
  assert.deepEqual(validateSettings([]), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings([1, 2, 3]), DEFAULT_SETTINGS);
});

test("validateSettings: 空对象 → 全默认", () => {
  assert.deepEqual(validateSettings({}), DEFAULT_SETTINGS);
});

test("validateSettings: 单字段非法 → 该字段默认，其余保留（部分恢复）", () => {
  const result = validateSettings({
    themePreference: "neon", // 非法
    displayPreference: "orb", // 合法
    activeClient: "zcode", // 合法
    language: "fr", // 非法
    autoLaunch: true, // 合法
  });
  assert.equal(result.themePreference, "auto", "非法 theme 回退默认");
  assert.equal(result.displayPreference, "orb", "合法 display 保留");
  assert.equal(result.activeClient, "zcode", "合法 client 保留");
  assert.equal(result.language, "zh-CN", "非法 language 回退默认");
  assert.equal(result.autoLaunch, true, "合法 autoLaunch 保留");
});

test("validateSettings: 字段类型错（数字/布尔）→ 默认", () => {
  const result = validateSettings({
    themePreference: 123,
    displayPreference: true,
    activeClient: null,
    language: {},
    autoLaunch: "yes",
  });
  assert.deepEqual(result, DEFAULT_SETTINGS);
});

test("validateSettings: version 不匹配 → 仍逐字段校验，version 固定为当前版", () => {
  // 当前无破坏性迁移；version 字段被强制为 SETTINGS_VERSION。
  const result = validateSettings({ version: 999, themePreference: "dark" });
  assert.equal(result.version, SETTINGS_VERSION);
  assert.equal(result.themePreference, "dark");
});

test("validateSettings: v1 文件缺少 autoLaunch/placements → v3 安全迁移", () => {
  const result = validateSettings({
    version: 1,
    themePreference: "dark",
    displayPreference: "orb",
    activeClient: "zcode",
    language: "en",
  });
  assert.equal(result.version, SETTINGS_VERSION);
  assert.equal(result.autoLaunch, false);
  assert.deepEqual(result.windowPlacements, createDefaultWindowPlacements());
  assert.equal(result.themePreference, "dark", "迁移不丢已有合法偏好");
});

test("validateSettings: v2 保留 autoLaunch，缺少 placements → v3 全 surface 未保存", () => {
  const result = validateSettings({
    version: 2,
    themePreference: "light",
    displayPreference: "card",
    activeClient: "codex",
    language: "zh-CN",
    autoLaunch: true,
  });
  assert.equal(result.version, SETTINGS_VERSION);
  assert.equal(result.autoLaunch, true);
  assert.deepEqual(result.windowPlacements, createDefaultWindowPlacements());
});

test("validateSettings: 单个位置损坏只清空该 surface，其他位置保留", () => {
  const result = validateSettings({
    windowPlacements: {
      card: { displayId: "1", offsetX: 100, offsetY: 200, snapEdge: null },
      orb: { displayId: "1", offsetX: "bad", offsetY: 30, snapEdge: "left" },
    },
  });
  assert.deepEqual(result.windowPlacements.card, {
    displayId: "1",
    offsetX: 100,
    offsetY: 200,
    snapEdge: null,
  });
  assert.equal(result.windowPlacements.orb, null);
});

test("validateSettings: 多余字段被忽略", () => {
  const result = validateSettings({
    themePreference: "dark",
    bridgeKey: "should-be-ignored", // 红线：不应保存敏感字段，校验时直接丢弃
    extra: 123,
  });
  assert.equal(result.themePreference, "dark");
  assert.equal(
    (result as unknown as Record<string, unknown>).bridgeKey,
    undefined,
    "多余字段不入 Settings",
  );
});

// ─── normalizePreference（setPreference IPC 用）───

test("normalizePreference: 合法 key+value → {key, value}", () => {
  assert.deepEqual(normalizePreference("themePreference", "dark"), {
    key: "themePreference" as PreferenceKey,
    value: "dark",
  });
  assert.deepEqual(normalizePreference("language", "en"), {
    key: "language" as PreferenceKey,
    value: "en",
  });
  assert.deepEqual(normalizePreference("displayPreference", "orb"), {
    key: "displayPreference" as PreferenceKey,
    value: "orb",
  });
  assert.deepEqual(normalizePreference("activeClient", "zcode"), {
    key: "activeClient" as PreferenceKey,
    value: "zcode",
  });
  assert.deepEqual(normalizePreference("autoLaunch", true), {
    key: "autoLaunch" as PreferenceKey,
    value: true,
  });
});

test("normalizePreference: 非法 value → null", () => {
  assert.equal(normalizePreference("themePreference", "neon"), null);
  assert.equal(
    normalizePreference("displayPreference", "edge-capsule"),
    null,
    "edge-capsule 不是合法 displayPreference",
  );
  assert.equal(normalizePreference("language", "fr"), null);
  assert.equal(normalizePreference("activeClient", "claude"), null);
  assert.equal(normalizePreference("autoLaunch", "true"), null, "布尔偏好不接受字符串伪装");
});

test("normalizePreference: 非法 key → null", () => {
  assert.equal(normalizePreference("unknown", "dark"), null);
  assert.equal(normalizePreference("", "dark"), null);
  assert.equal(normalizePreference("version", 1), null, "version 不可经 setPreference 改");
  assert.equal(
    normalizePreference("windowPlacements", {}),
    null,
    "窗口坐标只能由主进程写，不能经 renderer setPreference 改",
  );
});

test("normalizePreference: key/value 类型错 → null", () => {
  assert.equal(normalizePreference(123, "dark"), null);
  assert.equal(normalizePreference(null, "dark"), null);
  assert.equal(normalizePreference("themePreference", 123), null);
  assert.equal(normalizePreference("themePreference", null), null);
  assert.equal(normalizePreference("themePreference", { a: 1 }), null);
});

// ─── 问题 4：语言解析（首次启动按系统语言初始化）───
// 必须调真实的 resolveLanguageFromLocale（shared/settings.ts），不复制规则，
// 否则实现位置错误仍会假绿。

test("resolveLanguageFromLocale: zh* → zh-CN，其他 → en（调真实函数）", () => {
  const cases: Array<{ locale: string; expected: "zh-CN" | "en" }> = [
    { locale: "zh-CN", expected: "zh-CN" },
    { locale: "zh-Hans", expected: "zh-CN" },
    { locale: "zh-TW", expected: "zh-CN" },
    { locale: "zh", expected: "zh-CN" },
    { locale: "ZH-CN", expected: "zh-CN" }, // 大小写不敏感
    { locale: "en-US", expected: "en" },
    { locale: "en-GB", expected: "en" },
    { locale: "ja", expected: "en" },
    { locale: "fr-FR", expected: "en" },
    { locale: "", expected: "en" }, // 空 → en
  ];
  for (const { locale, expected } of cases) {
    assert.equal(
      resolveLanguageFromLocale(locale),
      expected,
      `locale="${locale}" 应映射为 ${expected}`,
    );
  }
});

test("resolveLanguageFromLocale: 非字符串（null/数字）防御性返 en", () => {
  // 纯函数防御：非法输入不抛，回退 en。
  assert.equal(resolveLanguageFromLocale(null as unknown as string), "en");
  assert.equal(resolveLanguageFromLocale(123 as unknown as string), "en");
});
