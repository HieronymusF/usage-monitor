/**
 * 托盘实例（Milestone E-F）。
 *
 * 依赖 electron 运行时（Tray / Menu / nativeImage），核心菜单模板构造已抽成纯函数
 *（menu-builder.ts，被 tests/electron/tray-menu.test.ts 覆盖）；本模块只做：
 * - 创建 Tray + 占位图标 + tooltip。
 * - 根据 settings 构造菜单并 setContextMenu。
 * - 偏好变化时重建菜单（语言切换/任何 radio 选中变化都要刷新 ✓）。
 * - destroy() 优雅销毁。
 *
 * 占位图标：nativeImage 内嵌最小 PNG（16x16），避免卡在美术资源上（视觉留 Milestone H）。
 */
import { Tray, Menu, nativeImage } from "electron";
import { buildTrayMenuTemplate, TRAY_STRINGS, type TrayMenuCallbacks } from "./menu-builder.js";
import type { SettingsRepository } from "../settings/repository.js";

export interface CreateTrayOptions {
  repo: SettingsRepository;
  callbacks: TrayMenuCallbacks;
  /** 应用显示名（tooltip 用）。 */
  appName?: string;
}

/**
 * 创建托盘。返回 { destroy }。
 * 调用方（main.ts）需在 preference 变化时调用 rebuild() 刷新菜单的 ✓ 状态。
 */
export function createTray(opts: CreateTrayOptions): {
  destroy(): void;
  rebuild(): void;
} {
  const { repo, callbacks } = opts;
  const appName = opts.appName ?? "Codex Usage Monitor";
  const icon = createPlaceholderIcon();
  const tray = new Tray(icon);
  tray.setToolTip(appName);

  const rebuild = (): void => {
    const settings = repo.get();
    const template = buildTrayMenuTemplate(settings, callbacks);
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };

  // 首次构建。
  rebuild();

  return {
    rebuild,
    destroy() {
      tray.destroy();
    },
  };
}

/**
 * 最小占位托盘图标（16x16 透明 PNG，base64 内嵌）。
 * 一个 1x1 浅色像素的极简图——功能可用，视觉留 Milestone H 美术资源（.ico 多分辨率）。
 */
function createPlaceholderIcon(): Electron.NativeImage {
  // 16x16 单色（浅灰 #888）PNG，避免全透明看不见。
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR4nO3OQQ0AIBADwYJ/87mdQSuY" +
    "iEtKA7W4r1o2s7tn7T7bABAEQRAEQRAEQRAEQRAEQRAEQRAEQf8D8u4PJLpv6T8AAAAASUVORK5CYII=";
  const buffer = Buffer.from(pngBase64, "base64");
  return nativeImage.createFromBuffer(buffer, { scaleFactor: 1.0 });
}

export { TRAY_STRINGS };
