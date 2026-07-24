/**
 * 托盘菜单模板测试（Milestone E-F）。
 *
 * 测 buildTrayMenuTemplate 纯函数：结构、当前选中 ✓、回调触发、多语言文案。
 * 不 new Tray/Menu（依赖 electron 运行时），只断言返回的 MenuItemConstructorOptions[]。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrayMenuTemplate,
  TRAY_STRINGS,
  type TrayMenuCallbacks,
} from "../../electron/tray/menu-builder";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/settings";

/** 记录所有回调调用，断言哪个被触发。 */
function makeCallbacks(): TrayMenuCallbacks & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openCard: () => calls.push("openCard"),
    setDisplayPreference: (pref) => calls.push(`display:${pref}`),
    setActiveClient: (client) => calls.push(`client:${client}`),
    setThemePreference: (pref) => calls.push(`theme:${pref}`),
    setLanguage: (lang) => calls.push(`language:${lang}`),
    refresh: () => calls.push("refresh"),
    quit: () => calls.push("quit"),
  };
}

/** 顶层菜单项 label 数组（跳过 separator）。 */
function topLabels(menu: ReturnType<typeof buildTrayMenuTemplate>): string[] {
  return menu.filter((item) => "label" in item).map((item) => item.label ?? "");
}

// ─── 结构 ───

test("结构：顶层 8 项（打开Card / sep / 4 子菜单 / sep / 刷新 / 退出）", () => {
  const menu = buildTrayMenuTemplate(DEFAULT_SETTINGS, makeCallbacks());
  // 顶层项数 = 1(openCard) + 1(sep) + 4(submenu) + 1(sep) + 1(refresh) + 1(quit) = 9
  assert.equal(menu.length, 9);
  assert.equal(menu[0]?.label, "打开卡片", "中文默认 openCard");
  assert.equal(menu[1]?.type, "separator");
  assert.equal(menu[2]?.label, "展示模式");
  assert.equal(menu[3]?.label, "客户端");
  assert.equal(menu[4]?.label, "主题");
  assert.equal(menu[5]?.label, "语言");
  assert.equal(menu[6]?.type, "separator");
  assert.equal(menu[7]?.label, "刷新");
  assert.equal(menu[8]?.label, "退出");
});

test("子菜单项数：展示模式4 / 客户端2 / 主题3 / 语言2", () => {
  const menu = buildTrayMenuTemplate(DEFAULT_SETTINGS, makeCallbacks());
  const display = menu[2]?.submenu;
  const client = menu[3]?.submenu;
  const theme = menu[4]?.submenu;
  const language = menu[5]?.submenu;
  assert.ok(Array.isArray(display));
  assert.ok(Array.isArray(client));
  assert.ok(Array.isArray(theme));
  assert.ok(Array.isArray(language));
  assert.equal((display as Array<{ label: string }>).length, 4);
  assert.equal((client as Array<{ label: string }>).length, 2);
  assert.equal((theme as Array<{ label: string }>).length, 3);
  assert.equal((language as Array<{ label: string }>).length, 2);
});

// ─── 当前选中 ✓ ───

test("当前选中项打 ✓：默认 settings 选中 auto / codex / auto / zh-CN", () => {
  const menu = buildTrayMenuTemplate(DEFAULT_SETTINGS, makeCallbacks());
  const display = menu[2]?.submenu as Array<{ label: string; checked?: boolean }>;
  const client = menu[3]?.submenu as Array<{ label: string; checked?: boolean }>;
  const theme = menu[4]?.submenu as Array<{ label: string; checked?: boolean }>;
  const language = menu[5]?.submenu as Array<{ label: string; checked?: boolean }>;

  assert.ok(display[0]?.checked, "display auto 选中");
  assert.ok(client[0]?.checked, "client codex 选中");
  assert.ok(theme[0]?.checked, "theme auto 选中");
  assert.ok(language[0]?.checked, "language zh-CN 选中");
  assert.equal(display[1]?.checked, false, "display card 未选中");
});

test("选中项随 settings 变化：dark / orb / zcode / en", () => {
  const settings: Settings = {
    version: 1,
    themePreference: "dark",
    displayPreference: "orb",
    activeClient: "zcode",
    language: "en",
  };
  const menu = buildTrayMenuTemplate(settings, makeCallbacks());
  const display = menu[2]?.submenu as Array<{ label: string; checked?: boolean }>;
  const client = menu[3]?.submenu as Array<{ label: string; checked?: boolean }>;
  const theme = menu[4]?.submenu as Array<{ label: string; checked?: boolean }>;
  const language = menu[5]?.submenu as Array<{ label: string; checked?: boolean }>;

  assert.ok(display[3]?.checked, "display orb 选中");
  assert.ok(client[1]?.checked, "client zcode 选中");
  assert.ok(theme[2]?.checked, "theme dark 选中");
  assert.ok(language[1]?.checked, "language en 选中");
});

// ─── 回调触发 ───

test("click 回调：openCard / refresh / quit", () => {
  const cb = makeCallbacks();
  const menu = buildTrayMenuTemplate(DEFAULT_SETTINGS, cb);
  (menu[0] as { click?: () => void }).click?.();
  (menu[7] as { click?: () => void }).click?.();
  (menu[8] as { click?: () => void }).click?.();
  assert.deepEqual(cb.calls, ["openCard", "refresh", "quit"]);
});

test("click 回调：子菜单 setDisplayPreference 传正确值", () => {
  const cb = makeCallbacks();
  const menu = buildTrayMenuTemplate(DEFAULT_SETTINGS, cb);
  const display = menu[2]?.submenu as Array<{
    label: string;
    click?: () => void;
  }>;
  // 点 card（index 1）
  display[1]?.click?.();
  // 点 orb（index 3）
  display[3]?.click?.();
  assert.deepEqual(cb.calls, ["display:card", "display:orb"]);
});

test("click 回调：主题/客户端/语言子菜单传正确值", () => {
  const cb = makeCallbacks();
  const menu = buildTrayMenuTemplate(DEFAULT_SETTINGS, cb);
  const client = menu[3]?.submenu as Array<{ click?: () => void }>;
  const theme = menu[4]?.submenu as Array<{ click?: () => void }>;
  const language = menu[5]?.submenu as Array<{ click?: () => void }>;
  client[1]?.click?.(); // zcode
  theme[2]?.click?.(); // dark
  language[1]?.click?.(); // en
  assert.deepEqual(cb.calls, ["client:zcode", "theme:dark", "language:en"]);
});

// ─── 多语言 ───

test("英文菜单文案", () => {
  const enSettings: Settings = { ...DEFAULT_SETTINGS, language: "en" };
  const menu = buildTrayMenuTemplate(enSettings, makeCallbacks());
  const labels = topLabels(menu);
  assert.deepEqual(labels, [
    "Open Card",
    "Display mode",
    "Client",
    "Theme",
    "Language",
    "Refresh",
    "Quit",
  ]);
});

test("语言子项总是显示自身名称（不随当前语言变）", () => {
  // 中文 settings 下，语言子项仍是 简体中文 / English
  const zhMenu = buildTrayMenuTemplate(DEFAULT_SETTINGS, makeCallbacks());
  const zhLang = zhMenu[5]?.submenu as Array<{ label: string }>;
  assert.deepEqual(
    zhLang.map((i) => i.label),
    ["简体中文", "English"],
  );
  // 英文 settings 下同样
  const enMenu = buildTrayMenuTemplate({ ...DEFAULT_SETTINGS, language: "en" }, makeCallbacks());
  const enLang = enMenu[5]?.submenu as Array<{ label: string }>;
  assert.deepEqual(
    enLang.map((i) => i.label),
    ["简体中文", "English"],
  );
});

test("TRAY_STRINGS 导出两种语言", () => {
  assert.equal(TRAY_STRINGS["zh-CN"].openCard, "打开卡片");
  assert.equal(TRAY_STRINGS.en.openCard, "Open Card");
});
