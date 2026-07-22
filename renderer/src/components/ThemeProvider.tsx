import React from "react";
/**
 * ThemeProvider — 把主进程的 systemTheme 接到 themeStore，并在 mount 时应用初始主题。
 *
 * 职责（单一）：
 * 1. mount 时读 window.monitor.getContext() 拿初始 systemTheme，写入 store。
 * 2. 订阅 onSystemThemeChange，系统主题变化时更新 store（auto 模式自动跟随）。
 * 3. mount 完成后调用 applyTheme() 把初始 resolved 写到 <html>。
 *
 * 不在这里做用户偏好切换（那是 IconButton/Milestone C 的事）。
 * 不在这里做持久化（那是 Milestone G settings 的事）。
 */

import { type ReactNode, useEffect } from "react";
import type { SystemTheme } from "../../../shared/desktop";
import { useThemeStore } from "../stores/themeStore";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const setSystemTheme = useThemeStore((state) => state.setSystemTheme);
  const applyTheme = useThemeStore((state) => state.applyTheme);

  useEffect(() => {
    let active = true;

    // 1. 读初始 systemTheme（main.ts 在 capture 模式下让 getContext 返回 "light"）
    void window.monitor.getContext().then((context) => {
      if (!active) return;
      setSystemTheme(context.systemTheme);
    });

    // 2. 订阅系统主题变化
    const unsubscribe = window.monitor.onSystemThemeChange((systemTheme: SystemTheme) => {
      setSystemTheme(systemTheme);
    });

    // 3. 兜底：万一 getContext 失败，至少用当前 store 值应用一次
    applyTheme();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setSystemTheme, applyTheme]);

  return <>{children}</>;
}
