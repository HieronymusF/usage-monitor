export const desktopChannels = {
  getContext: "desktop:get-context",
  systemThemeChanged: "desktop:system-theme-changed",
  getUsage: "usage:get",
  refreshUsage: "usage:refresh",
  // Milestone E-F 验收修复：主进程刷新后立即把新快照推给所有 renderer（托盘刷新 / 未来外部触发）。
  usageChanged: "usage:changed",
  resizeCardWindow: "card:resize-window",
  showSurface: "surface:show",
  moveOrb: "orb:move",
  dragOrbEnd: "orb:drag-end",
  getOrbBounds: "orb:get-bounds",
  suspendHover: "hover:suspend",
  resumeHover: "hover:resume",
  // Milestone E-F/G：用户偏好（主进程为单一真相源）。
  getPreferences: "preferences:get",
  setPreference: "preferences:set",
  preferenceChanged: "preferences:changed",
} as const;
