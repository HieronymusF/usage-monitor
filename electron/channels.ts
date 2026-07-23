export const desktopChannels = {
  getContext: "desktop:get-context",
  systemThemeChanged: "desktop:system-theme-changed",
  getUsage: "usage:get",
  refreshUsage: "usage:refresh",
  resizeCardWindow: "card:resize-window",
  showSurface: "surface:show",
  moveOrb: "orb:move",
  dragOrbEnd: "orb:drag-end",
  getOrbBounds: "orb:get-bounds",
  suspendHover: "hover:suspend",
  resumeHover: "hover:resume",
} as const;
