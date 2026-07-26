/**
 * 托盘实例（Milestone E-F）。
 *
 * 依赖 electron 运行时（Tray / Menu / nativeImage），核心菜单模板构造已抽成纯函数
 *（menu-builder.ts，被 tests/electron/tray-menu.test.ts 覆盖）；本模块只做：
 * - 创建 Tray + 正式多分辨率图标 + tooltip。
 * - 根据 settings 构造菜单并 setContextMenu。
 * - 偏好变化时重建菜单（语言切换/任何 radio 选中变化都要刷新 ✓）。
 * - destroy() 优雅销毁。
 *
 * 正式图标由 main.ts 解析 resources/usage-monitor.ico（开发态源码、打包态 extraResources）。
 */
import { Tray, Menu, nativeImage } from "electron";
import { buildTrayMenuTemplate, TRAY_STRINGS, type TrayMenuCallbacks } from "./menu-builder.js";
import type { SettingsRepository } from "../settings/repository.js";
import type { MultiClientSnapshot } from "../../server/types.js";
import { renderUsageTrayIconPng, selectTrayRemainingPercent } from "./usage-icon.js";

export interface CreateTrayOptions {
  repo: SettingsRepository;
  callbacks: TrayMenuCallbacks;
  /** 应用显示名（tooltip 用）。 */
  appName?: string;
  /** 多分辨率 .ico 绝对路径。 */
  iconPath: string;
}

/**
 * 创建托盘。返回 { destroy }。
 * 调用方（main.ts）需在 preference 变化时调用 rebuild() 刷新菜单的 ✓ 状态。
 */
export function createTray(opts: CreateTrayOptions): {
  destroy(): void;
  rebuild(): void;
  updateUsage(snapshot: MultiClientSnapshot): void;
} {
  const { repo, callbacks } = opts;
  const appName = opts.appName ?? "Codex Usage Monitor";
  const fallbackIcon = loadTrayIcon(opts.iconPath);
  const tray = new Tray(createUsageIcon(null, fallbackIcon));
  let latestSnapshot: MultiClientSnapshot | null = null;
  tray.setToolTip(appName);

  const updateIcon = (): void => {
    if (latestSnapshot === null) return;
    const remainingPercent = selectTrayRemainingPercent(latestSnapshot, repo.get().activeClient);
    tray.setImage(createUsageIcon(remainingPercent, fallbackIcon));
    tray.setToolTip(
      remainingPercent === null ? appName : `${appName} · ${Math.round(remainingPercent)}%`,
    );
  };

  const rebuild = (): void => {
    const settings = repo.get();
    const template = buildTrayMenuTemplate(settings, callbacks);
    tray.setContextMenu(Menu.buildFromTemplate(template));
    updateIcon();
  };

  // 首次构建。
  rebuild();

  return {
    rebuild,
    updateUsage(snapshot) {
      latestSnapshot = snapshot;
      updateIcon();
    },
    destroy() {
      tray.destroy();
    },
  };
}

function createUsageIcon(
  remainingPercent: number | null,
  fallback: Electron.NativeImage,
): Electron.NativeImage {
  const icon = nativeImage.createFromBuffer(renderUsageTrayIconPng(remainingPercent, 32));
  return icon.isEmpty() ? fallback : icon;
}

/**
 * 加载正式托盘图标。资源缺失/损坏时保留可见兜底，避免整个常驻应用因图标失败退出。
 */
function loadTrayIcon(iconPath: string): Electron.NativeImage {
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) return icon;
  console.error(`[tray] icon failed to load: ${iconPath}; using fallback`);
  // 仅故障兜底：16x16 单色 PNG。正常开发/打包路径必须使用 usage-monitor.ico。
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR4nO3OQQ0AIBADwYJ/87mdQSuY" +
    "iEtKA7W4r1o2s7tn7T7bABAEQRAEQRAEQRAEQRAEQRAEQRAEQf8D8u4PJLpv6T8AAAAASUVORK5CYII=";
  const buffer = Buffer.from(pngBase64, "base64");
  return nativeImage.createFromBuffer(buffer, { scaleFactor: 1.0 });
}

export { TRAY_STRINGS };
