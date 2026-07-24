/**
 * electron/paths 资源路径解析纯函数测试（Milestone H 打包支持）。
 *
 * 覆盖五类输入（纪律 F）：正常值 / 空参数 / 非法类型 / 边界（打包态 vs 开发态）。
 * 纯函数不碰 Electron API，CI 安全。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { inAsar, unpacked, extraResource, type ResourceContext } from "../../electron/paths.js";

const dev: ResourceContext = {
  packaged: false,
  appPath: "D:/proj/codex-usage-monitor",
  resourcesPath: "D:/proj/codex-usage-monitor",
};

const packaged: ResourceContext = {
  packaged: true,
  appPath: "C:/Users/x/AppData/Local/Programs/usage-monitor/resources/app.asar",
  resourcesPath: "C:/Users/x/AppData/Local/Programs/usage-monitor/resources",
};

test("inAsar: 开发态用 appPath 基准（项目根）", () => {
  assert.equal(
    inAsar(["dist", "companionBridge.js"], dev),
    join(dev.appPath, "dist", "companionBridge.js"),
  );
  assert.equal(
    inAsar(["out", "renderer", "index.html"], dev),
    join(dev.appPath, "out", "renderer", "index.html"),
  );
});

test("inAsar: 打包态用 resourcesPath/app.asar 基准", () => {
  assert.equal(
    inAsar(["dist", "companionBridge.js"], packaged),
    join(packaged.resourcesPath, "app.asar", "dist", "companionBridge.js"),
  );
  assert.equal(
    inAsar(["out", "preload", "index.cjs"], packaged),
    join(packaged.resourcesPath, "app.asar", "out", "preload", "index.cjs"),
  );
});

test("unpacked: 开发态用 appPath 基准（与 inAsar 一致，因为开发态无 asar）", () => {
  assert.equal(
    unpacked(["electron", "probe-daemon.ps1"], dev),
    join(dev.appPath, "electron", "probe-daemon.ps1"),
  );
});

test("unpacked: 打包态用 resourcesPath/app.asar.unpacked 基准（ps1 必须解包给外部进程）", () => {
  assert.equal(
    unpacked(["electron", "probe-daemon.ps1"], packaged),
    join(packaged.resourcesPath, "app.asar.unpacked", "electron", "probe-daemon.ps1"),
  );
});

test("inAsar / unpacked: 空参数数组不抛，返回基准（防御）", () => {
  assert.equal(inAsar([], dev), join(dev.appPath));
  assert.equal(inAsar([], packaged), join(packaged.resourcesPath, "app.asar"));
  assert.equal(unpacked([], packaged), join(packaged.resourcesPath, "app.asar.unpacked"));
  assert.equal(unpacked([], dev), join(dev.appPath));
});

test("inAsar / unpacked: 单段路径正确", () => {
  assert.equal(inAsar(["dist"], dev), join(dev.appPath, "dist"));
  assert.equal(
    unpacked(["electron"], packaged),
    join(packaged.resourcesPath, "app.asar.unpacked", "electron"),
  );
});

test("inAsar / unpacked: 多段路径正确拼接", () => {
  assert.equal(
    inAsar(["a", "b", "c", "d.js"], packaged),
    join(packaged.resourcesPath, "app.asar", "a", "b", "c", "d.js"),
  );
  assert.equal(
    unpacked(["x", "y", "z.ps1"], packaged),
    join(packaged.resourcesPath, "app.asar.unpacked", "x", "y", "z.ps1"),
  );
});

test("inAsar / unpacked: 两态路径互不相同（打包态带 app.asar 段，开发态不带）", () => {
  const devPath = inAsar(["dist", "x.js"], dev);
  const pkgPath = inAsar(["dist", "x.js"], packaged);
  assert.notEqual(devPath, pkgPath);
  assert.ok(pkgPath.includes("app.asar"), `打包态路径应含 app.asar: ${pkgPath}`);
  assert.ok(!devPath.includes("app.asar"), `开发态路径不应含 app.asar: ${devPath}`);
});

test("unpacked: 打包态路径用 app.asar.unpacked（不是 app.asar）", () => {
  const pkgUnpacked = unpacked(["electron", "x.ps1"], packaged);
  assert.ok(
    pkgUnpacked.includes("app.asar.unpacked"),
    `unpacked 打包态应含 app.asar.unpacked: ${pkgUnpacked}`,
  );
  assert.ok(
    !pkgUnpacked.endsWith("app.asar"),
    `unpacked 打包态不应以 app.asar 结尾: ${pkgUnpacked}`,
  );
});

test("extraResource: 开发态用 appPath + devRelative（项目源码树）", () => {
  assert.equal(
    extraResource("probe-daemon.ps1", "electron/probe-daemon.ps1", dev),
    join(dev.appPath, "electron/probe-daemon.ps1"),
  );
});

test("extraResource: 打包态用 resourcesPath + packagedName（asar 外 resources 根）", () => {
  assert.equal(
    extraResource("probe-daemon.ps1", "electron/probe-daemon.ps1", packaged),
    join(packaged.resourcesPath, "probe-daemon.ps1"),
  );
  const result = extraResource("probe-daemon.ps1", "electron/probe-daemon.ps1", packaged);
  assert.ok(
    !result.includes("app.asar"),
    `extraResource 打包态不应含 app.asar（资源在 resources 根）: ${result}`,
  );
});

test("extraResource: 打包态路径不带子目录（与 extraResources 的 to 配置一致）", () => {
  // electron-builder extraResources to="probe-daemon.ps1" → resources/probe-daemon.ps1（扁平）
  const result = extraResource("probe-daemon.ps1", "electron/probe-daemon.ps1", packaged);
  assert.ok(
    result.endsWith(join("resources", "probe-daemon.ps1")),
    `打包态应以 resources/probe-daemon.ps1 结尾: ${result}`,
  );
});
