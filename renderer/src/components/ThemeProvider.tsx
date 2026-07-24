import React from "react";
/**
 * ThemeProvider — 把主进程的 systemTheme + 用户偏好接到 themeStore，并在 mount 时应用初始主题。
 *
 * 职责：
 * 1. mount 时读 window.monitor.getContext() 拿初始 systemTheme，写入 store。
 * 2. 订阅 onSystemThemeChange，系统主题变化时更新 store（auto 模式自动跟随）。
 * 3. Milestone E-F/G：读 getPreferences() hydrate 用户偏好，订阅 onPreferenceChanged。
 * 4. mount 完成后调用 applyTheme() 把初始 resolved 写到 <html>。
 *
 * 偏好持久化由主进程负责（主进程单一真相源）；本组件只 hydrate + 监听。
 */

import { type ReactNode, useEffect } from "react";
import type { SystemTheme } from "../../../shared/desktop";
import { useThemeStore } from "../stores/themeStore";
import { useUsageStore } from "../stores/usageStore";
import { useDisplayStore } from "../stores/displayStore";
import i18n from "../i18n";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const setSystemTheme = useThemeStore((state) => state.setSystemTheme);
  const hydrateTheme = useThemeStore((state) => state.hydrateFromPreferences);
  const applyTheme = useThemeStore((state) => state.applyTheme);

  useEffect(() => {
    let active = true;

    // 1. 读初始 systemTheme（main.ts 在 capture 模式下让 getContext 返回 "light"）。
    //    验收轮 4 P2：显式 catch——失败记录简短错误（不输出敏感数据），保留本地默认不阻止渲染。
    //    active guard：unmount 后迟到的 resolve/reject 不更新 store。
    void window.monitor.getContext().then(
      (context) => {
        if (!active) return;
        setSystemTheme(context.systemTheme);
      },
      (err: unknown) => {
        if (!active) return;
        console.error(
          "[ThemeProvider] getContext failed:",
          err instanceof Error ? err.message : String(err),
        );
      },
    );

    // 2. 订阅系统主题变化
    const unsubSystem = window.monitor.onSystemThemeChange((systemTheme: SystemTheme) => {
      setSystemTheme(systemTheme);
    });

    // 3. Milestone E-F/G：hydrate 用户偏好（theme/client/display/language）。
    //    主进程为单一真相源——启动拉一次 + 订阅后续变化。
    //    验收轮 4 P2：显式 catch + active guard——失败/迟到都不更新 store/i18n。
    void window.monitor.getPreferences().then(
      (settings) => {
        if (!active) return;
        hydrateTheme(settings);
        useUsageStore.getState().hydrateFromPreferences(settings);
        useDisplayStore.getState().hydrateFromPreferences(settings);
        void i18n.changeLanguage(settings.language);
      },
      (err: unknown) => {
        if (!active) return;
        console.error(
          "[ThemeProvider] getPreferences failed:",
          err instanceof Error ? err.message : String(err),
        );
      },
    );
    const unsubPrefs = window.monitor.onPreferenceChanged((settings) => {
      if (!active) return;
      hydrateTheme(settings);
      useUsageStore.getState().hydrateFromPreferences(settings);
      useDisplayStore.getState().hydrateFromPreferences(settings);
      void i18n.changeLanguage(settings.language);
    });

    // 4. 兜底：万一 getContext/getPreferences 失败，至少用当前 store 值应用一次
    applyTheme();

    return () => {
      active = false;
      unsubSystem();
      unsubPrefs();
    };
  }, [setSystemTheme, hydrateTheme, applyTheme]);

  return <>{children}</>;
}
