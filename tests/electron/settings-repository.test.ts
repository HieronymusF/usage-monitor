/**
 * SettingsRepository 测试（Milestone E-F/G 设置持久化）。
 *
 * 用 os.tmpdir 下的临时目录测真实文件 IO（load/get/update/原子写/容错/严格串行）。
 * 不依赖 electron 的 app（路径构造注入），CI 安全。
 *
 * 测试清理遵守 AGENTS.md：不递归遍历、不批量删除目录。
 * 每个测试用唯一目录路径，finally 只删明确的 settings.json（或自定义名）单文件；
 * 临时目录本身留给 OS 清理（不 rmdir/rm -r）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsRepository } from "../../electron/settings/repository";
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from "../../shared/settings";

let dirCounter = 0;
/** 每个测试一个唯一目录路径。 */
function uniqueTempDir(): string {
  return join(tmpdir(), `cum-settings-${process.pid}-${Date.now()}-${++dirCounter}`);
}

/** AGENTS.md 合规清理：只删明确的单文件路径（force 容错已删/不存在）。 */
async function removeFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    await rm(filePath, { force: true });
  }
}

/**
 * 测试 helper：创建唯一临时目录（单层 mkdir），结束只清理 settings.json 单文件。
 * 不递归遍历、不 rmdir 目录（留给 OS 清理）。
 */
async function withTempSettings<T>(
  fn: (dir: string, remove: (file: string) => Promise<void>) => Promise<T>,
): Promise<T> {
  const dir = uniqueTempDir();
  await mkdir(dir, { recursive: true });
  try {
    return await fn(dir, removeFile);
  } finally {
    await removeFile(join(dir, "settings.json"));
  }
}

test("load: 文件缺失 → 默认值，不抛", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    assert.deepEqual(repo.load(), DEFAULT_SETTINGS);
  });
});

test("load: 完整合法文件 → 原样", async () => {
  await withTempSettings(async (dir) => {
    const valid = {
      version: SETTINGS_VERSION,
      themePreference: "dark",
      displayPreference: "orb",
      activeClient: "zcode",
      language: "en",
      autoLaunch: true,
      windowPlacements: {
        ...DEFAULT_SETTINGS.windowPlacements,
        orb: { displayId: "2", offsetX: 6, offsetY: 240, snapEdge: "left" },
      },
    };
    await writeFile(join(dir, "settings.json"), JSON.stringify(valid));
    const repo = new SettingsRepository({ dir });
    const loaded = repo.load();
    assert.equal(loaded.themePreference, "dark");
    assert.equal(loaded.displayPreference, "orb");
    assert.equal(loaded.activeClient, "zcode");
    assert.equal(loaded.language, "en");
    assert.equal(loaded.autoLaunch, true);
    assert.deepEqual(loaded.windowPlacements.orb, {
      displayId: "2",
      offsetX: 6,
      offsetY: 240,
      snapEdge: "left",
    });
  });
});

test("load: JSON 损坏 → 默认值，不抛", async () => {
  await withTempSettings(async (dir) => {
    await writeFile(join(dir, "settings.json"), "{not valid json");
    const repo = new SettingsRepository({ dir });
    assert.deepEqual(repo.load(), DEFAULT_SETTINGS);
  });
});

test("load: 字段非法 → 部分恢复（合法字段保留，非法回退默认）", async () => {
  await withTempSettings(async (dir) => {
    await writeFile(
      join(dir, "settings.json"),
      JSON.stringify({
        themePreference: "neon", // 非法
        displayPreference: "orb", // 合法
        activeClient: "codex",
        language: "zh-CN",
      }),
    );
    const repo = new SettingsRepository({ dir });
    const loaded = repo.load();
    assert.equal(loaded.themePreference, "auto", "非法回退默认");
    assert.equal(loaded.displayPreference, "orb", "合法保留");
  });
});

test("load: 幂等（重复调用只首次读盘，返回缓存）", async () => {
  await withTempSettings(async (dir) => {
    await writeFile(
      join(dir, "settings.json"),
      JSON.stringify({ ...DEFAULT_SETTINGS, themePreference: "dark" }),
    );
    const repo = new SettingsRepository({ dir });
    const first = repo.load();
    await writeFile(join(dir, "settings.json"), JSON.stringify(DEFAULT_SETTINGS));
    const second = repo.load();
    assert.deepEqual(second, first, "第二次 load 返回缓存");
    assert.equal(second.themePreference, "dark");
  });
});

test("get: 未 load → 返回构造默认", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    assert.deepEqual(repo.get(), DEFAULT_SETTINGS);
  });
});

test("update: 合法字段 → 更新内存 + 原子写盘", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const updated = repo.update("themePreference", "dark");
    assert.equal(updated.themePreference, "dark");
    assert.equal(repo.get().themePreference, "dark", "内存已更新");
    await repo.flush();
    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.themePreference, "dark", "已写盘");
  });
});

test("update: autoLaunch 布尔偏好 → 更新内存 + 写盘；字符串伪装被拒绝", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const updated = repo.update("autoLaunch", true);
    assert.equal(updated.autoLaunch, true);
    const unchanged = repo.update("autoLaunch", "true");
    assert.equal(unchanged, updated, "非法字符串不产生新 Settings");
    await repo.flush();
    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.autoLaunch, true);
  });
});

test("update: 非法 value → 忽略，返回当前值不变", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const before = repo.get();
    const after = repo.update("themePreference", "neon");
    assert.deepEqual(after, before, "非法 value 不改变设置");
  });
});

test("update: 非法 key → 忽略", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const before = repo.get();
    // @ts-expect-error 测试非法 key 传入
    const after = repo.update("unknownKey", "x");
    assert.deepEqual(after, before);
  });
});

test("updateWindowPlacement: 合法位置按 surface 更新并写盘，相同值不重复生成 Settings", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const placement = { displayId: "2", offsetX: 6, offsetY: 240, snapEdge: "left" as const };
    const updated = repo.updateWindowPlacement("orb", placement);
    assert.deepEqual(updated.windowPlacements.orb, placement);
    assert.equal(
      repo.getWindowPlacement("orb"),
      updated.windowPlacements.orb,
      "get 读取 repository 内同一规范化 placement",
    );
    const unchanged = repo.updateWindowPlacement("orb", { ...placement });
    assert.equal(unchanged, updated, "相同位置短路，不产生新 Settings");
    await repo.flush();
    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.deepEqual(onDisk.windowPlacements.orb, placement);
  });
});

test("updateWindowPlacement: 非法 surface/坐标/吸附边被拒绝，不污染其他位置", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const before = repo.get();
    // @ts-expect-error 运行时防御：伪造 surface。
    assert.equal(repo.updateWindowPlacement("unknown", {}), before);
    assert.equal(
      repo.updateWindowPlacement("card", {
        displayId: "1",
        offsetX: Number.NaN,
        offsetY: 1,
        snapEdge: null,
      }),
      before,
    );
    assert.equal(
      repo.updateWindowPlacement("orb", {
        displayId: "1",
        offsetX: 6,
        offsetY: 1,
        snapEdge: "top",
      }),
      before,
    );
    assert.deepEqual(repo.get().windowPlacements, DEFAULT_SETTINGS.windowPlacements);
  });
});

// ─── P1 修复：严格串行写盘（不得并发 rename / ENOENT）───

test("update: 连续快速多次更新 → 串行写盘，最终磁盘是最新完整 Settings，无残留 tmp", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    repo.update("themePreference", "dark");
    repo.update("displayPreference", "orb");
    repo.update("activeClient", "zcode");
    repo.update("language", "en");
    repo.update("autoLaunch", true);
    repo.updateWindowPlacement("card", {
      displayId: "1",
      offsetX: 100,
      offsetY: 200,
      snapEdge: null,
    });
    repo.updateWindowPlacement("orb", {
      displayId: "2",
      offsetX: 6,
      offsetY: 240,
      snapEdge: "left",
    });
    await repo.flush();
    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.themePreference, "dark");
    assert.equal(onDisk.displayPreference, "orb");
    assert.equal(onDisk.activeClient, "zcode");
    assert.equal(onDisk.language, "en");
    assert.equal(onDisk.autoLaunch, true);
    assert.deepEqual(onDisk.windowPlacements.card, {
      displayId: "1",
      offsetX: 100,
      offsetY: 200,
      snapEdge: null,
    });
    assert.deepEqual(onDisk.windowPlacements.orb, {
      displayId: "2",
      offsetX: 6,
      offsetY: 240,
      snapEdge: "left",
    });
    // 无残留 tmp：每次写盘用唯一 .tmp.N，写完即删。逐个明确检查不存在。
    for (let i = 1; i <= 10; i++) {
      assert.equal(existsSync(join(dir, `settings.json.tmp.${i}`)), false, `tmp.${i} 不残留`);
    }
  });
});

test("update: 串行队列保证每次写盘用唯一 tmp，连续 update 无 ENOENT", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    const values = ["dark", "light", "auto", "dark", "light"];
    for (const v of values) {
      repo.update("themePreference", v);
    }
    await repo.flush();
    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.themePreference, "light", "最后一次值");
  });
});

test("flush: await 全部已排队写入（连续 update 后 flush 返回时磁盘已最新）", async () => {
  await withTempSettings(async (dir) => {
    const repo = new SettingsRepository({ dir });
    repo.load();
    repo.update("themePreference", "dark");
    repo.update("language", "en");
    await repo.flush();
    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.themePreference, "dark");
    assert.equal(onDisk.language, "en");
  });
});

test("load 后新实例重读 → 拿到上次写盘的值（跨进程持久化语义）", async () => {
  await withTempSettings(async (dir) => {
    const repo1 = new SettingsRepository({ dir });
    repo1.load();
    repo1.update("themePreference", "dark");
    repo1.update("language", "en");
    await repo1.flush();
    const repo2 = new SettingsRepository({ dir });
    const reloaded = repo2.load();
    assert.equal(reloaded.themePreference, "dark");
    assert.equal(reloaded.language, "en");
  });
});

test("update: 父目录不存在 → 自动创建", async () => {
  const dir = uniqueTempDir();
  const nested = join(dir, "nested", "deep");
  const nestedFile = join(nested, "settings.json");
  try {
    const repo = new SettingsRepository({ dir: nested });
    repo.load();
    repo.update("themePreference", "dark");
    await repo.flush();
    const onDisk = JSON.parse(await readFile(nestedFile, "utf8"));
    assert.equal(onDisk.themePreference, "dark");
  } finally {
    // AGENTS.md：只删明确的单文件，不递归删嵌套目录（留给 OS）。
    await removeFile(nestedFile);
  }
});

test("filename 选项: 自定义文件名", async () => {
  const dir = uniqueTempDir();
  const prefsFile = join(dir, "prefs.json");
  try {
    const repo = new SettingsRepository({ dir, filename: "prefs.json" });
    assert.equal(repo.filePath, prefsFile);
    repo.load();
    repo.update("themePreference", "dark");
    await repo.flush();
    const onDisk = JSON.parse(await readFile(prefsFile, "utf8"));
    assert.equal(onDisk.themePreference, "dark");
  } finally {
    await removeFile(prefsFile);
  }
});

// ─── 问题 4：initialDefaults 注入（locale 解析）───

test("initialDefaults: 文件缺失时用注入的默认值", async () => {
  await withTempSettings(async (dir) => {
    const localeDefaults = { ...DEFAULT_SETTINGS, language: "en" as const };
    const repo = new SettingsRepository({ dir, initialDefaults: localeDefaults });
    const loaded = repo.load();
    assert.equal(loaded.language, "en", "文件缺失用 initialDefaults");
  });
});

test("initialDefaults: 用户已保存的值优先于 initialDefaults", async () => {
  await withTempSettings(async (dir) => {
    await writeFile(
      join(dir, "settings.json"),
      JSON.stringify({ ...DEFAULT_SETTINGS, language: "zh-CN" }),
    );
    const localeDefaults = { ...DEFAULT_SETTINGS, language: "en" as const };
    const repo = new SettingsRepository({ dir, initialDefaults: localeDefaults });
    const loaded = repo.load();
    assert.equal(loaded.language, "zh-CN", "已保存文件优先");
  });
});
