/**
 * 资源路径解析（Milestone H 打包支持）。
 *
 * 背景：开发态用 `app.getAppPath()`（项目根）拼资源路径；打包后 `app.getAppPath()`
 * 返回 `resources/app.asar`，而 `process.resourcesPath` 指向 `resources/`。
 * 两类资源在打包后位置不同：
 *  - **asar 内**：Electron 自身能读（require / loadFile / asar 虚拟 FS）。
 *    打包后路径 = `resources/app.asar/<relative>`。
 *  - **asar 解包**（asarUnpack）：必须被 asar 外的外部进程读（如 powershell.exe -File
 *    执行 .ps1，powershell 看不到 asar 虚拟 FS）。打包后路径 =
 *    `resources/app.asar.unpacked/<relative>`。
 *
 * 本模块是纯函数，便于在打包/未打包两态下做确定性测试（反模式 F：五类输入）。
 * main.ts 启动时调一次 `createResourceResolver(app)` 拿到带上下文的 resolver，
 * 各调用点用 `resolver.inAsar(...)` / `resolver.unpacked(...)` 替代裸 join(app.getAppPath(), ...)。
 */

import { join } from "node:path";

/** 资源解析依赖的运行时上下文（由 main.ts 注入，测试可 mock）。 */
export interface ResourceContext {
  /** app.isPackaged：true = 打包态（app.asar 内运行），false = 开发态。 */
  readonly packaged: boolean;
  /** app.getAppPath()：开发态=项目根，打包态=resources/app.asar。 */
  readonly appPath: string;
  /** process.resourcesPath：打包态=resources/，开发态=electron 返回的项目根的某个值。 */
  readonly resourcesPath: string;
}

/**
 * 相对 app.asar 内的路径解析（Electron 自身能读的资源：renderer html、preload cjs、
 * 被 Electron-as-node 执行的 bridge .js 等）。
 *
 * - 打包态：`<resourcesPath>/app.asar/<segments>`
 * - 开发态：`<appPath>/<segments>`
 *
 * 注：appPath 在打包态本就等于 `<resourcesPath>/app.asar`，但显式拼 app.asar 更清晰，
 * 且不依赖 appPath 的具体值（防御）。
 */
export function inAsar(segments: readonly string[], ctx: ResourceContext): string {
  const rel = joinSafe(segments);
  if (ctx.packaged) return join(ctx.resourcesPath, "app.asar", rel);
  return join(ctx.appPath, rel);
}

/**
 * 相对 asar 解包目录的路径解析（必须被 asar 外外部进程读的资源：.ps1 等）。
 *
 * - 打包态：`<resourcesPath>/app.asar.unpacked/<segments>`
 * - 开发态：`<appPath>/<segments>`（开发态无 asar，资源就在项目源码树里）
 *
 * 调用方需保证对应资源在 electron-builder 的 asarUnpack 配置里声明了。
 */
export function unpacked(segments: readonly string[], ctx: ResourceContext): string {
  const rel = joinSafe(segments);
  if (ctx.packaged) return join(ctx.resourcesPath, "app.asar.unpacked", rel);
  return join(ctx.appPath, rel);
}

/**
 * extraResources 路径解析（用 electron-builder 的 extraResources 复制到 resources/ 根，
 * asar 外、不在 app.asar.unpacked 子树里）。
 *
 * - 打包态：`<resourcesPath>/<to>`（to 是 extraResources 配置的目标文件名）
 * - 开发态：`<appPath>/<from-relative>`（开发态资源在项目源码树里）
 *
 * 适合 ps1 这类：源文件在 electron/（不进 asar），但需被 powershell 外部进程执行。
 * extraResources 比 asarUnpack 更干净（不依赖文件先在 asar 内再解包）。
 *
 * @param packagedName extraResources 的 to（目标文件名，如 "probe-daemon.ps1"）
 * @param devRelative 开发态相对 appPath 的路径（如 "electron/probe-daemon.ps1"）
 */
export function extraResource(
  packagedName: string,
  devRelative: string,
  ctx: ResourceContext,
): string {
  if (ctx.packaged) return join(ctx.resourcesPath, packagedName);
  return join(ctx.appPath, devRelative);
}

/** join 的安全包装：空 segments 数组返回 "."（不抛），非法 string 参数正常 join（path.join 自身处理）。 */
function joinSafe(segments: readonly string[]): string {
  if (segments.length === 0) return ".";
  return join(...segments);
}
