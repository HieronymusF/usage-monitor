/**
 * 偏好提交协调器 + IPC sender 校验（Milestone E-F/G 生产模块）。
 *
 * 把 main.ts commitPreference 的"写偏好 + 广播 + 重建托盘 + 应用各副作用"协调逻辑
 * 提取为独立可测模块。main.ts 注入真实副作用（broadcast/rebuild/nativeTheme 等），
 * 测试注入 fake 副作用——测试调真实 commitPreference，不再复制逻辑（验收 P2 修复）。
 *
 * 单一入口不变式：repo.update + broadcast + tray.rebuild + theme/display/client 副作用
 * 必须全部执行；遗漏任一会让对应测试失败。
 *
 * handleGetPreferences/handleSetPreference 把 IPC 的 sender 校验逻辑提取为纯函数，
 * ipc.ts 的 handler 只做 ipcMain 胶水——测试直接测纯函数覆盖合法/未知 sender（验收 P1）。
 *
 * 不依赖 electron 运行时（副作用/surface 解析经接口注入），可在 node:test 直接测。
 */
import type {
  ClientKind,
  DisplayPreference,
  PreferenceKey,
  PreferenceValue,
  Settings,
  ThemePreference,
} from "../shared/settings.js";
import { normalizePreference } from "../shared/settings.js";
import type { SettingsRepository } from "./settings/repository.js";
import type { SurfaceKind } from "../shared/desktop.js";

/**
 * 偏好变更的副作用集合（生产 main.ts 注入真实实现，测试注入 fake 记录调用）。
 * 每个方法对应一种副作用的可观测行为——测试断言它们被调用。
 */
export interface PreferenceSideEffects {
  /** 广播新 Settings 到所有 renderer（broadcastPreferences）。 */
  broadcast(next: Settings): void;
  /** 重建托盘菜单（刷新选中项 ✓ + 文案）。 */
  rebuildTray(): void;
  /** 主题偏好副作用（main.ts: nativeTheme.themeSource 同步）。 */
  applyTheme(pref: ThemePreference): void;
  /** 展示模式副作用（main.ts: watcher 启停 + showOnly）。 */
  applyDisplay(pref: DisplayPreference): void;
  /** 客户端副作用（main.ts: resizeCardWindow）。 */
  resizeClient(client: ClientKind): void;
  /** 开机自启副作用（main.ts: app.setLoginItemSettings）。 */
  applyAutoLaunch(enabled: boolean): void;
}

/**
 * 创建偏好提交协调器。返回 commitPreference(key, value)。
 * 绑定 repo + 副作用，所有偏好变更经此单一入口。
 */
export function createPreferenceCommitter(
  repo: SettingsRepository,
  effects: PreferenceSideEffects,
): (key: PreferenceKey, value: PreferenceValue) => Settings {
  return function commitPreference(key: PreferenceKey, value: PreferenceValue): Settings {
    const prev = repo.get();
    const updated = repo.update(key, value);
    if (updated === prev) return updated; // 值未变，短路（不广播/不 rebuild/无副作用）。
    // 单一入口不变式：以下副作用必须全部执行（遗漏任一会破坏一致性）。
    effects.broadcast(updated);
    effects.rebuildTray();
    switch (key) {
      case "themePreference":
        effects.applyTheme(updated.themePreference);
        break;
      case "displayPreference":
        effects.applyDisplay(updated.displayPreference);
        break;
      case "activeClient":
        effects.resizeClient(updated.activeClient);
        break;
      case "language":
        // 语言切换只影响菜单文案（rebuild 已处理）和 renderer（broadcast 已处理），无额外副作用。
        break;
      case "autoLaunch":
        effects.applyAutoLaunch(updated.autoLaunch);
        break;
    }
    return updated;
  };
}

/** 仅供类型/文档引用：展示模式偏好对应的可见 surface（displayPreference 非 auto 值即 SurfaceKind）。 */
export type { SurfaceKind };

// ─── IPC sender 校验（纯函数，验收 P1）───

/**
 * sender 身份解析结果。
 * - `trusted`：sender 属于受信任 renderer（surface 已知）。
 * - `unknown`：sender 不属于 SurfaceWindowManager 管理的 renderer（surface 未解析）。
 */
export type SenderTrust = { kind: "trusted"; surface: SurfaceKind } | { kind: "unknown" };

/**
 * 把 windowManager.getSurfaceForWebContents 的返回值（SurfaceKind | undefined）
 * 解析成可判别的 SenderTrust（纪律 B：不折叠 unknown 和 trusted）。
 * 注入 resolveSurface 让测试可控（生产用 windowManager.getSurfaceForWebContents）。
 */
export function resolveSenderTrust(
  senderId: number,
  resolveSurface: (id: number) => SurfaceKind | undefined,
): SenderTrust {
  const surface = resolveSurface(senderId);
  if (surface === undefined) return { kind: "unknown" };
  return { kind: "trusted", surface };
}

/** IPC handler 的偏好回调接口（与 ipc.ts 的 DesktopIpcCallbacks 对齐，但独立以便测）。 */
export interface PreferenceIpcCallbacks {
  getPreferences(): Settings;
  onSetPreference(key: PreferenceKey, value: PreferenceValue): void;
}

/**
 * getPreferences IPC 的纯逻辑：未知 sender 拒绝（返 Error 让 invoke reject）。
 * 合法 sender 返回当前 Settings。ipc.ts handler 调此函数，只做 ipcMain 胶水。
 */
export function handleGetPreferences(
  senderId: number,
  resolveSurface: (id: number) => SurfaceKind | undefined,
  callbacks: PreferenceIpcCallbacks,
): Settings {
  const trust = resolveSenderTrust(senderId, resolveSurface);
  if (trust.kind === "unknown") {
    throw new Error(`getPreferences rejected: unknown sender ${senderId}`);
  }
  return callbacks.getPreferences();
}

/**
 * setPreference IPC 的纯逻辑：未知 sender 忽略 + 记录（返 false）。
 * 合法 sender + 合法类型 → 转发到 commitPreference（返 true）。
 * 返回 boolean 表示是否转发（测试断言用）。
 */
export function handleSetPreference(
  senderId: number,
  key: unknown,
  value: unknown,
  resolveSurface: (id: number) => SurfaceKind | undefined,
  callbacks: PreferenceIpcCallbacks,
  log: (msg: string) => void = console.error,
): boolean {
  const trust = resolveSenderTrust(senderId, resolveSurface);
  if (trust.kind === "unknown") {
    log(`[ipc] setPreference rejected: unknown sender ${senderId}`);
    return false;
  }
  const normalized = normalizePreference(key, value);
  if (!normalized) return false;
  callbacks.onSetPreference(normalized.key, normalized.value);
  return true;
}

// ─── 通用 IPC sender 校验（验收轮 4 P1：补齐 getUsage/refreshUsage/resizeCardWindow/showSurface）───
// 统一复用 resolveSenderTrust，不再写多份不同判断。

/**
 * invoke 类 IPC（需返回值）的 sender 校验：未知 sender 抛错让 invoke reject。
 * 合法 sender 返回 trust（含 surface），调用方据此执行业务。
 * channelName 进错误消息便于排查。log 用于记录拒绝（默认 console.error）。
 */
export function requireTrustedSender(
  senderId: number,
  channelName: string,
  resolveSurface: (id: number) => SurfaceKind | undefined,
  log: (msg: string) => void = console.error,
): SenderTrust {
  const trust = resolveSenderTrust(senderId, resolveSurface);
  if (trust.kind === "unknown") {
    log(`[ipc] ${channelName} rejected: unknown sender ${senderId}`);
    throw new Error(`${channelName} rejected: unknown sender ${senderId}`);
  }
  return trust;
}

/**
 * send 类 IPC（单向命令）的 sender 校验：未知 sender 忽略 + 记录，返 null。
 * 合法 sender 返回 trust，调用方据此执行副作用。
 * 返 null 表示已忽略（调用方应直接 return）。
 */
export function allowTrustedSender(
  senderId: number,
  channelName: string,
  resolveSurface: (id: number) => SurfaceKind | undefined,
  log: (msg: string) => void = console.error,
): SenderTrust | null {
  const trust = resolveSenderTrust(senderId, resolveSurface);
  if (trust.kind === "unknown") {
    log(`[ipc] ${channelName} rejected: unknown sender ${senderId}`);
    return null;
  }
  return trust;
}

// ─── 托盘刷新协调（验收轮 4 P2：提取为可测生产函数，main.ts 和测试都调它）───

/**
 * 托盘刷新的协调逻辑：refresh → 拿到 snapshot → broadcast。
 * - 成功：broadcast 一次返回的 snapshot（对象一致），resolve snapshot。
 * - 失败：不广播、不抛（捕获并记录简短错误），resolve undefined。
 * 不产生 unhandled rejection（内部 .catch 兜底）。
 *
 * 提取为独立函数让 main.ts tray refresh 回调和测试调同一份真实逻辑，
 * 避免"测试用 fake 串联、main.ts 漏广播"测不出的问题。
 *
 * @param refresh 返回新 snapshot 的函数（main.ts 注入 bridgeClient.refreshUsage）
 * @param broadcast 广播 snapshot 的函数（main.ts 注入 broadcastUsage）
 * @param log 错误日志（默认 console.error，不输出敏感数据）
 */
export async function performTrayRefresh<T>(
  refresh: () => Promise<T>,
  broadcast: (snapshot: T) => void,
  log: (msg: string, err: unknown) => void = (msg, err) =>
    console.error(msg, err instanceof Error ? err.message : String(err)),
): Promise<T | undefined> {
  try {
    const snapshot = await refresh();
    broadcast(snapshot);
    return snapshot;
  } catch (err) {
    log("[tray] refresh failed:", err);
    return undefined;
  }
}
