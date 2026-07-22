import type { BrowserWindowConstructorOptions } from "electron";
import type { SurfaceKind } from "../../shared/desktop.js";

export interface SurfaceWindowSpec {
  kind: SurfaceKind;
  width: number;
  height: number;
  resizable: boolean;
  extraOptions?: Pick<
    BrowserWindowConstructorOptions,
    "minWidth" | "maxWidth" | "minHeight" | "maxHeight"
  >;
}
