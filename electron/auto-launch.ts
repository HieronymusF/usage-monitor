/**
 * Windows 开机自启路径解析（Milestone H 切片 2）。
 *
 * electron-builder portable 会先把应用解压到临时目录；此时 process.execPath 指向
 * 临时内部 exe，不能持久注册。portable.nsi 会注入 PORTABLE_EXECUTABLE_FILE，
 * 它才是用户双击的稳定外层 exe 路径。
 *
 * 本模块保持纯函数，不直接依赖 Electron，便于覆盖开发态/打包态/平台/畸形路径。
 */
import { win32 } from "node:path";

export interface AutoLaunchRuntime {
  readonly packaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly execPath: string;
  readonly portableExecutableFile?: string;
}

export type AutoLaunchTarget =
  | { kind: "available"; executablePath: string }
  | { kind: "unavailable"; reason: "development" | "unsupported-platform" | "invalid-path" };

export interface LoginItemRegistration {
  openAtLogin: boolean;
  path: string;
  args: string[];
  name: string;
}

export interface LoginItemAdapter {
  setLoginItemSettings(settings: LoginItemRegistration): void;
}

export type AutoLaunchApplyResult =
  | { kind: "applied"; executablePath: string; enabled: boolean }
  | { kind: "skipped"; reason: AutoLaunchTarget & { kind: "unavailable" } }
  | { kind: "failed"; error: unknown };

/**
 * 解析 Windows 登录项应指向的稳定 exe。
 * - 开发态不注册，避免 npm start 调试污染系统启动项。
 * - portable 优先外层 PORTABLE_EXECUTABLE_FILE。
 * - 普通打包态回退 process.execPath（为未来 installer 保留）。
 */
export function resolveAutoLaunchTarget(runtime: AutoLaunchRuntime): AutoLaunchTarget {
  if (!runtime.packaged) return { kind: "unavailable", reason: "development" };
  if (runtime.platform !== "win32") {
    return { kind: "unavailable", reason: "unsupported-platform" };
  }

  const executablePath = runtime.portableExecutableFile?.trim() || runtime.execPath.trim();
  if (!win32.isAbsolute(executablePath)) {
    return { kind: "unavailable", reason: "invalid-path" };
  }
  return { kind: "available", executablePath };
}

/**
 * 把持久化偏好同步到 Windows 登录项。
 * 注册和取消都使用同一 path/args/name，确保 Electron 能定位同一条 registry entry。
 */
export function applyAutoLaunchPreference(
  enabled: boolean,
  runtime: AutoLaunchRuntime,
  adapter: LoginItemAdapter,
  appName = "Usage Monitor",
): AutoLaunchApplyResult {
  const target = resolveAutoLaunchTarget(runtime);
  if (target.kind === "unavailable") {
    return { kind: "skipped", reason: target };
  }
  try {
    adapter.setLoginItemSettings({
      openAtLogin: enabled,
      path: target.executablePath,
      args: [],
      name: appName,
    });
    return { kind: "applied", executablePath: target.executablePath, enabled };
  } catch (error) {
    return { kind: "failed", error };
  }
}
