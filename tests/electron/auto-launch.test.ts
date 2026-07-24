import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAutoLaunchPreference,
  resolveAutoLaunchTarget,
  type AutoLaunchRuntime,
} from "../../electron/auto-launch.js";

const packagedWindows: AutoLaunchRuntime = {
  packaged: true,
  platform: "win32",
  execPath: String.raw`C:\Users\user\AppData\Local\Temp\usage-monitor\Usage Monitor.exe`,
  portableExecutableFile: String.raw`D:\Apps\usage-monitor-portable-0.2.0.exe`,
};

test("portable 打包态优先注册稳定外层 exe，不注册临时 process.execPath", () => {
  assert.deepEqual(resolveAutoLaunchTarget(packagedWindows), {
    kind: "available",
    executablePath: String.raw`D:\Apps\usage-monitor-portable-0.2.0.exe`,
  });
});

test("开发态受保护，不返回可注册路径", () => {
  assert.deepEqual(resolveAutoLaunchTarget({ ...packagedWindows, packaged: false }), {
    kind: "unavailable",
    reason: "development",
  });
});

test("非 Windows 平台受保护", () => {
  assert.deepEqual(resolveAutoLaunchTarget({ ...packagedWindows, platform: "darwin" }), {
    kind: "unavailable",
    reason: "unsupported-platform",
  });
});

test("普通打包态无 portable 环境变量时回退 process.execPath", () => {
  const installedWindows: AutoLaunchRuntime = {
    packaged: true,
    platform: "win32",
    execPath: packagedWindows.execPath,
  };
  assert.deepEqual(resolveAutoLaunchTarget(installedWindows), {
    kind: "available",
    executablePath: packagedWindows.execPath,
  });
});

test("空值或相对路径判为不可用", () => {
  assert.deepEqual(
    resolveAutoLaunchTarget({
      ...packagedWindows,
      portableExecutableFile: "   ",
      execPath: "Usage Monitor.exe",
    }),
    { kind: "unavailable", reason: "invalid-path" },
  );
});

test("启用/禁用都用同一稳定 path/args/name 写登录项", () => {
  const calls: unknown[] = [];
  const adapter = { setLoginItemSettings: (settings: unknown) => calls.push(settings) };
  assert.deepEqual(applyAutoLaunchPreference(true, packagedWindows, adapter), {
    kind: "applied",
    executablePath: packagedWindows.portableExecutableFile,
    enabled: true,
  });
  assert.deepEqual(applyAutoLaunchPreference(false, packagedWindows, adapter), {
    kind: "applied",
    executablePath: packagedWindows.portableExecutableFile,
    enabled: false,
  });
  assert.deepEqual(calls, [
    {
      openAtLogin: true,
      path: packagedWindows.portableExecutableFile,
      args: [],
      name: "Usage Monitor",
    },
    {
      openAtLogin: false,
      path: packagedWindows.portableExecutableFile,
      args: [],
      name: "Usage Monitor",
    },
  ]);
});

test("开发态不调用 Electron 登录项 API", () => {
  let calls = 0;
  const result = applyAutoLaunchPreference(
    true,
    { ...packagedWindows, packaged: false },
    { setLoginItemSettings: () => calls++ },
  );
  assert.deepEqual(result, {
    kind: "skipped",
    reason: { kind: "unavailable", reason: "development" },
  });
  assert.equal(calls, 0);
});

test("Electron 登录项 API 抛错时返回 failed，不让异常越过启动边界", () => {
  const boom = new Error("registry denied");
  const result = applyAutoLaunchPreference(true, packagedWindows, {
    setLoginItemSettings: () => {
      throw boom;
    },
  });
  assert.deepEqual(result, { kind: "failed", error: boom });
});
