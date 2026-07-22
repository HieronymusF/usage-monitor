/** Fluent System Icons SVG 封装（visual-spec §图标语义与形状）。 */
import React from "react";
import { ArrowClockwiseRegular } from "@fluentui/react-icons/headless/svg/arrow-clockwise";
import { DarkThemeRegular } from "@fluentui/react-icons/headless/svg/dark-theme";
import { PersonSwapRegular } from "@fluentui/react-icons/headless/svg/person-swap";
import { WeatherMoonRegular } from "@fluentui/react-icons/headless/svg/weather-moon";
import { WeatherSunnyRegular } from "@fluentui/react-icons/headless/svg/weather-sunny";

/** Fluent 图标语义名（对应 visual-spec §图标语义表）。 */
export type FluentIconName = "switchClient" | "refresh" | "themeAuto" | "themeLight" | "themeDark";

const FLUENT_ICONS = {
  switchClient: PersonSwapRegular,
  refresh: ArrowClockwiseRegular,
  themeAuto: DarkThemeRegular,
  themeLight: WeatherSunnyRegular,
  themeDark: WeatherMoonRegular,
} as const;

export interface FluentIconProps {
  name: FluentIconName;
  /** 像素尺寸，默认 18（visual-spec Icon 行：16 或 18）。 */
  size?: 16 | 18;
  /** 颜色，默认 var(--c-secondary)（与 IconButton 图标色一致）。 */
  color?: string;
  className?: string;
  "aria-hidden"?: boolean;
}

export function FluentIcon({
  name,
  size = 18,
  color = "var(--c-secondary)",
  ...rest
}: FluentIconProps): React.ReactElement {
  const Icon = FLUENT_ICONS[name];
  return (
    <Icon
      aria-hidden={rest["aria-hidden"] ?? true}
      data-icon-name={name}
      fontSize={size}
      primaryFill={color}
      style={{ display: "block" }}
      {...(rest.className !== undefined ? { className: rest.className } : {})}
    />
  );
}
