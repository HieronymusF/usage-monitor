/**
 * Milestone E-F 验收轮 3 集成测试。
 *
 * 测真实生产模块（不复制逻辑）：
 * - electron/preferences.ts 的 createPreferenceCommitter：theme/client/display/language 变更 →
 *   repo 落盘 + broadcast + tray.rebuild + 对应副作用（applyTheme/applyDisplay/resizeClient）全执行。
 *   遗漏任一副作用 → 对应断言失败（P2 修复：不再复制 commitPreference）。
 * - handleGetPreferences/handleSetPreference：合法/未知 sender 校验（P1 修复）。
 *
 * 副作用/surface 解析经接口注入 fake（不依赖 electron 运行时），CI 安全。
 * 测试清理遵守 AGENTS.md：唯一目录 + 删明确单文件，不递归遍历/批量删。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rm, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsRepository } from "../../electron/settings/repository";
import {
  createPreferenceCommitter,
  handleGetPreferences,
  handleSetPreference,
  resolveSenderTrust,
  requireTrustedSender,
  allowTrustedSender,
  performTrayRefresh,
  type PreferenceSideEffects,
  type PreferenceIpcCallbacks,
} from "../../electron/preferences";
import { buildTrayMenuTemplate, type TrayMenuCallbacks } from "../../electron/tray/menu-builder";
import type { PreferenceKey, PreferenceValue, Settings } from "../../shared/settings";
import type { SurfaceKind } from "../../shared/desktop";

let dirCounter = 0;
function uniqueTempDir(): string {
  return join(tmpdir(), `cum-integ-${process.pid}-${Date.now()}-${++dirCounter}`);
}
async function removeFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    await rm(filePath, { force: true });
  }
}
async function withTempSettings<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = uniqueTempDir();
  await mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await removeFile(join(dir, "settings.json"));
  }
}

/** 记录所有副作用调用的 fake（断言它们被调用）。 */
function makeFakeEffects(): PreferenceSideEffects & {
  broadcasts: Settings[];
  rebuilds: number;
  themes: string[];
  displays: string[];
  clients: string[];
  autoLaunches: boolean[];
} {
  const effects = {
    broadcasts: [] as Settings[],
    rebuilds: 0,
    themes: [] as string[],
    displays: [] as string[],
    clients: [] as string[],
    autoLaunches: [] as boolean[],
  };
  return {
    ...effects,
    broadcast: (next: Settings) => effects.broadcasts.push(next),
    rebuildTray: () => effects.rebuilds++,
    applyTheme: (pref: string) => effects.themes.push(pref),
    applyDisplay: (pref: string) => effects.displays.push(pref),
    resizeClient: (client: string) => effects.clients.push(client),
    applyAutoLaunch: (enabled: boolean) => effects.autoLaunches.push(enabled),
    // getter 让测试读最新值
    get broadcasts() {
      return effects.broadcasts;
    },
    get rebuilds() {
      return effects.rebuilds;
    },
    get themes() {
      return effects.themes;
    },
    get displays() {
      return effects.displays;
    },
    get clients() {
      return effects.clients;
    },
    get autoLaunches() {
      return effects.autoLaunches;
    },
  };
}

/** 把 commitPreference 包成 TrayMenuCallbacks（复用真实协调器）。 */
function makeTrayCallbacks(
  commit: (key: PreferenceKey, value: PreferenceValue) => Settings,
): TrayMenuCallbacks {
  return {
    openCard: () => {},
    setDisplayPreference: (pref) => commit("displayPreference", pref),
    setActiveClient: (client) => commit("activeClient", client),
    setThemePreference: (pref) => commit("themePreference", pref),
    setLanguage: (lang) => commit("language", lang),
    refresh: () => {},
    setAutoLaunch: (enabled) => commit("autoLaunch", enabled),
    quit: () => {},
  };
}

// ─── 真实 createPreferenceCommitter：theme/client/display 副作用全执行 ───

test("集成：改 theme → repo 落盘 + broadcast + tray.rebuild + applyTheme 副作用全执行（真实协调器）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const callbacks = makeTrayCallbacks(commit);

    callbacks.setThemePreference("dark");
    await repo.flush();

    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.themePreference, "dark");
    assert.equal(effects.broadcasts.length, 1, "broadcast 执行");
    assert.equal(effects.rebuilds, 1, "tray.rebuild 执行");
    assert.deepEqual(effects.themes, ["dark"], "applyTheme 副作用执行");
    assert.equal(effects.displays.length, 0, "display 副作用不触发");
    assert.equal(effects.clients.length, 0, "client 副作用不触发");

    // 托盘选中项同步：rebuild 后菜单 dark 项 checked。
    const menu = buildTrayMenuTemplate(repo.get(), callbacks);
    const themeItems = menu[4]?.submenu as Array<{ checked?: boolean }>;
    assert.ok(themeItems[2]?.checked, "dark 选中");
  });
});

test("集成：改 client → repo 落盘 + broadcast + tray.rebuild + resizeClient 副作用", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    makeTrayCallbacks(commit).setActiveClient("zcode");
    await repo.flush();

    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.activeClient, "zcode");
    assert.equal(effects.broadcasts.length, 1);
    assert.equal(effects.rebuilds, 1);
    assert.deepEqual(effects.clients, ["zcode"], "resizeClient 副作用执行");
    assert.equal(effects.themes.length, 0, "theme 副作用不触发");
  });
});

test("集成：改 display → applyDisplay 副作用（watcher 启停）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    makeTrayCallbacks(commit).setDisplayPreference("orb");
    await repo.flush();

    assert.deepEqual(effects.displays, ["orb"], "applyDisplay 副作用执行");
    assert.equal(effects.broadcasts.length, 1);
  });
});

test("集成：改 autoLaunch → 落盘 + broadcast + tray.rebuild + Windows 登录项副作用", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    makeTrayCallbacks(commit).setAutoLaunch(true);
    await repo.flush();

    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.autoLaunch, true);
    assert.deepEqual(effects.autoLaunches, [true], "applyAutoLaunch 副作用执行");
    assert.equal(effects.broadcasts.length, 1);
    assert.equal(effects.rebuilds, 1);
  });
});

test("集成：同值偏好不触发副作用（幂等，值未变短路）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    // 默认 themePreference=auto，再设 auto 应短路。
    makeTrayCallbacks(commit).setThemePreference("auto");
    await repo.flush();
    assert.equal(effects.broadcasts.length, 0, "同值不广播");
    assert.equal(effects.rebuilds, 0, "同值不 rebuild");
    assert.equal(effects.themes.length, 0, "同值不 applyTheme");
  });
});

test("集成：遗漏任一副作用会被检测——协调器必须全执行（P2 不变量）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    // 故意提供"空实现"副作用——若协调器漏调，下面的断言会失败。
    const calls: string[] = [];
    const noopEffects: PreferenceSideEffects = {
      broadcast: () => calls.push("broadcast"),
      rebuildTray: () => calls.push("rebuild"),
      applyTheme: () => calls.push("theme"),
      applyDisplay: () => calls.push("display"),
      resizeClient: () => calls.push("client"),
      applyAutoLaunch: () => calls.push("autoLaunch"),
    };
    const commit = createPreferenceCommitter(repo, noopEffects);

    commit("themePreference", "dark");
    assert.ok(calls.includes("broadcast"), "theme 变更必须 broadcast");
    assert.ok(calls.includes("rebuild"), "theme 变更必须 rebuild");
    assert.ok(calls.includes("theme"), "theme 变更必须 applyTheme");

    calls.length = 0;
    commit("activeClient", "zcode");
    assert.ok(calls.includes("client"), "client 变更必须 resizeClient");

    calls.length = 0;
    commit("displayPreference", "orb");
    assert.ok(calls.includes("display"), "display 变更必须 applyDisplay");

    calls.length = 0;
    commit("autoLaunch", true);
    assert.ok(calls.includes("autoLaunch"), "autoLaunch 变更必须 applyAutoLaunch");
  });
});

// ─── 连续快速修改五项偏好 → flush/restart → 最终值完整恢复 ───

test("集成：连续快速修改五项偏好 → flush → restart → 全部最终值完整恢复", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const callbacks = makeTrayCallbacks(commit);

    callbacks.setThemePreference("dark");
    callbacks.setDisplayPreference("orb");
    callbacks.setActiveClient("zcode");
    callbacks.setLanguage("en");
    callbacks.setAutoLaunch(true);
    await repo.flush();

    const restarted = new SettingsRepository({ dir });
    const reloaded = restarted.load();
    assert.equal(reloaded.themePreference, "dark");
    assert.equal(reloaded.displayPreference, "orb");
    assert.equal(reloaded.activeClient, "zcode");
    assert.equal(reloaded.language, "en");
    assert.equal(reloaded.autoLaunch, true);
    // 5 次变更都广播 + rebuild（每次值都变）。
    assert.equal(effects.broadcasts.length, 5, "5 次变更都广播");
    assert.equal(effects.rebuilds, 5, "5 次变更都 rebuild");
    // 无残留 tmp。
    for (let i = 1; i <= 10; i++) {
      assert.equal(existsSync(join(dir, `settings.json.tmp.${i}`)), false, `tmp.${i} 不残留`);
    }
  });
});

// ─── P1：IPC sender 校验（真实 handleGetPreferences/handleSetPreference）───

function makeIpcCallbacks(
  commit: (key: PreferenceKey, value: PreferenceValue) => Settings,
  getPrefs: () => Settings,
): PreferenceIpcCallbacks {
  return {
    getPreferences: getPrefs,
    onSetPreference: (key, value) => commit(key, value),
  };
}

test("sender 校验：合法 sender（已知 surface）→ getPreferences 返回 Settings", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const ipc = makeIpcCallbacks(commit, () => repo.get());
    // fake resolver：senderId 1 → card（受信任）。
    const resolve = (id: number): SurfaceKind | undefined => (id === 1 ? "card" : undefined);

    const result = handleGetPreferences(1, resolve, ipc);
    assert.deepEqual(result, repo.get(), "合法 sender 返回当前 Settings");
  });
});

test("sender 校验：未知 sender → getPreferences 抛错（拒绝）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const ipc = makeIpcCallbacks(commit, () => repo.get());
    const resolve = (id: number): SurfaceKind | undefined => (id === 1 ? "card" : undefined);

    assert.throws(
      () => handleGetPreferences(999, resolve, ipc),
      /unknown sender 999/,
      "未知 sender 应抛错拒绝",
    );
  });
});

test("sender 校验：合法 sender → setPreference 转发到 commitPreference（副作用执行）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const ipc = makeIpcCallbacks(commit, () => repo.get());
    const resolve = (id: number): SurfaceKind | undefined => (id === 7 ? "orb" : undefined);

    const forwarded = handleSetPreference(7, "themePreference", "dark", resolve, ipc);
    assert.equal(forwarded, true, "合法 sender + 合法类型应转发");
    assert.deepEqual(effects.themes, ["dark"], "commitPreference 副作用执行");
  });
});

test("sender 校验：合法 sender 可转发 autoLaunch 布尔偏好", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const ipc = makeIpcCallbacks(commit, () => repo.get());
    const resolve = (): SurfaceKind | undefined => "card";

    assert.equal(handleSetPreference(7, "autoLaunch", true, resolve, ipc), true);
    assert.deepEqual(effects.autoLaunches, [true]);
    assert.equal(handleSetPreference(7, "autoLaunch", "true", resolve, ipc), false);
    assert.deepEqual(effects.autoLaunches, [true], "非法字符串不触发第二次副作用");
  });
});

test("sender 校验：未知 sender → setPreference 忽略（返 false）+ 记录，不触发副作用", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const ipc = makeIpcCallbacks(commit, () => repo.get());
    const resolve = (): SurfaceKind | undefined => undefined; // 所有 sender 未知
    const logs: string[] = [];

    const forwarded = handleSetPreference(999, "themePreference", "dark", resolve, ipc, (msg) =>
      logs.push(msg),
    );
    assert.equal(forwarded, false, "未知 sender 不转发");
    assert.ok(
      logs.some((l) => l.includes("unknown sender 999")),
      "记录拒绝日志",
    );
    assert.equal(effects.themes.length, 0, "未知 sender 不触发副作用");
    assert.equal(effects.broadcasts.length, 0, "未知 sender 不广播");
  });
});

test("sender 校验：合法 sender 但 key/value 类型错 → 忽略（返 false）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const effects = makeFakeEffects();
    const commit = createPreferenceCommitter(repo, effects);
    const ipc = makeIpcCallbacks(commit, () => repo.get());
    const resolve = (id: number): SurfaceKind | undefined => (id === 1 ? "card" : undefined);

    assert.equal(handleSetPreference(1, 123, "dark", resolve, ipc), false, "key 非字符串");
    assert.equal(
      handleSetPreference(1, "themePreference", null, resolve, ipc),
      false,
      "value 非字符串",
    );
    assert.equal(effects.broadcasts.length, 0, "类型错不触发副作用");
  });
});

test("resolveSenderTrust：可判别结果（trusted/unknown，不折叠）", () => {
  const resolve = (id: number): SurfaceKind | undefined => (id === 1 ? "orb" : undefined);
  assert.deepEqual(resolveSenderTrust(1, resolve), { kind: "trusted", surface: "orb" });
  assert.deepEqual(resolveSenderTrust(2, resolve), { kind: "unknown" });
});

// ─── P2-c：托盘刷新调真实 performTrayRefresh（不再手写串联 fake）───

test("托盘刷新（真实 performTrayRefresh）：refresh 成功 → 返回 snapshot 广播一次且对象一致", async () => {
  const broadcasted: unknown[] = [];
  const snapshot = { clients: { codex: { kind: "codex" } }, __test: "fresh" };
  const refresh = async (): Promise<typeof snapshot> => snapshot;
  const result = await performTrayRefresh(
    refresh,
    (s) => broadcasted.push(s),
    () => {},
  );
  assert.equal(result, snapshot, "返回 refresh 的 snapshot");
  assert.equal(broadcasted.length, 1, "广播恰好一次");
  assert.equal(broadcasted[0], snapshot, "广播对象一致（同一引用）");
});

test("托盘刷新（真实 performTrayRefresh）：refresh 失败 → 不广播、不抛、记录错误", async () => {
  const broadcasted: unknown[] = [];
  const logs: Array<{ msg: string; err: unknown }> = [];
  const refresh = async (): Promise<unknown> => {
    throw new Error("bridge down (test)");
  };
  // 不应抛（performTrayRefresh 内部 catch 兜底）。
  const result = await performTrayRefresh(
    refresh,
    (s) => broadcasted.push(s),
    (msg, err) => logs.push({ msg, err }),
  );
  assert.equal(result, undefined, "失败返回 undefined");
  assert.equal(broadcasted.length, 0, "失败不广播");
  assert.equal(logs.length, 1, "记录一次错误");
  assert.ok(logs[0]!.msg.includes("refresh failed"), "日志含 refresh failed");
});

test("托盘刷新（真实 performTrayRefresh）：连续刷新 → 每次成功结果分别广播，不串线", async () => {
  const broadcasted: unknown[] = [];
  let seq = 0;
  const refresh = async (): Promise<number> => ++seq;
  await performTrayRefresh(refresh, (s) => broadcasted.push(s));
  await performTrayRefresh(refresh, (s) => broadcasted.push(s));
  await performTrayRefresh(refresh, (s) => broadcasted.push(s));
  assert.deepEqual(broadcasted, [1, 2, 3], "三次刷新分别广播 1/2/3，不串线");
});

// ─── P1：通用 IPC sender 校验（requireTrustedSender / allowTrustedSender）───
// 复用 resolveSenderTrust，覆盖 getUsage/refreshUsage（invoke 拒绝）和 resizeCardWindow/showSurface（send 忽略）。

test("requireTrustedSender：合法 sender 返 trust（invoke 类如 getUsage/refreshUsage）", () => {
  const resolve = (id: number): SurfaceKind | undefined => (id === 5 ? "card" : undefined);
  const logs: string[] = [];
  const trust = requireTrustedSender(5, "getUsage", resolve, (msg) => logs.push(msg));
  assert.deepEqual(trust, { kind: "trusted", surface: "card" });
  assert.equal(logs.length, 0, "合法 sender 不记录");
});

test("requireTrustedSender：未知 sender 抛错 + 记录（invoke 拒绝，不读取/广播数据）", () => {
  const resolve = (): SurfaceKind | undefined => undefined;
  const logs: string[] = [];
  assert.throws(
    () => requireTrustedSender(999, "refreshUsage", resolve, (msg) => logs.push(msg)),
    /unknown sender 999/,
  );
  assert.ok(
    logs.some((l) => l.includes("refreshUsage") && l.includes("999")),
    "记录含通道名和 sender",
  );
});

test("allowTrustedSender：合法 sender 返 trust（send 类如 resizeCardWindow/showSurface）", () => {
  const resolve = (id: number): SurfaceKind | undefined => (id === 7 ? "orb" : undefined);
  const trust = allowTrustedSender(7, "showSurface", resolve);
  assert.deepEqual(trust, { kind: "trusted", surface: "orb" });
});

test("allowTrustedSender：未知 sender 返 null + 记录（send 忽略，不执行窗口副作用）", () => {
  const resolve = (): SurfaceKind | undefined => undefined;
  const logs: string[] = [];
  const trust = allowTrustedSender(999, "resizeCardWindow", resolve, (msg) => logs.push(msg));
  assert.equal(trust, null, "未知 sender 返 null（调用方应 return）");
  assert.ok(
    logs.some((l) => l.includes("resizeCardWindow")),
    "记录含通道名",
  );
});
