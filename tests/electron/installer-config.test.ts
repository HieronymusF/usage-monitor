import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface PackageConfig {
  scripts?: Record<string, string>;
  build?: {
    appId?: string;
    files?: string[];
    electronLanguages?: string[];
    win?: {
      target?: Array<{ target?: string; arch?: string[] }>;
    };
    portable?: { artifactName?: string };
    nsis?: {
      artifactName?: string;
      oneClick?: boolean;
      perMachine?: boolean;
      allowElevation?: boolean;
      allowToChangeInstallationDirectory?: boolean;
      createDesktopShortcut?: boolean | "always";
      createStartMenuShortcut?: boolean;
      deleteAppDataOnUninstall?: boolean;
      runAfterFinish?: boolean;
      shortcutName?: string;
    };
  };
}

async function readPackageConfig(): Promise<PackageConfig> {
  return JSON.parse(await readFile(resolve("package.json"), "utf8")) as PackageConfig;
}

test("发布构建同时声明 x64 portable 与 NSIS installer", async () => {
  const packageJson = await readPackageConfig();
  assert.equal(packageJson.build?.appId, "com.hieronymusf.usage-monitor");
  assert.deepEqual(packageJson.build?.win?.target, [
    { target: "portable", arch: ["x64"] },
    { target: "nsis", arch: ["x64"] },
  ]);
  assert.equal(
    packageJson.build?.portable?.artifactName,
    "usage-monitor-portable-${version}.${ext}",
  );
  assert.equal(packageJson.build?.nsis?.artifactName, "usage-monitor-setup-${version}.${ext}");
});

test("NSIS 使用可见安装向导且卸载保留用户设置，支持稳定升级/回退", async () => {
  const nsis = (await readPackageConfig()).build?.nsis;
  assert.deepEqual(nsis, {
    artifactName: "usage-monitor-setup-${version}.${ext}",
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    shortcutName: "Usage Monitor",
  });
});

test("发布脚本可分别构建 portable、installer 或两者", async () => {
  const scripts = (await readPackageConfig()).scripts;
  assert.equal(scripts?.["dist:portable"], "npm run build && electron-builder --win portable");
  assert.equal(scripts?.["dist:installer"], "npm run build && electron-builder --win nsis");
  assert.equal(scripts?.dist, "npm run build && electron-builder --win");
});

test("发布包排除运行时不需要的依赖，并只保留中英文语言包", async () => {
  const build = (await readPackageConfig()).build;
  assert.ok(build?.files?.includes("!node_modules/**/*"));
  assert.deepEqual(build?.electronLanguages, ["en-US", "zh-CN"]);
});
