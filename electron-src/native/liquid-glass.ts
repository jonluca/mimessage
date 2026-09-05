import type { BrowserWindow } from "electron";
import { createRequire } from "node:module";
import path from "node:path";

export type LiquidGlassStyle = "regular" | "clear";

export interface LiquidGlassColor {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
}

export interface LiquidGlassFrame {
  /** Distance from the left edge in logical points. */
  x?: number;
  /** Distance from the top edge in logical points. */
  y?: number;
  /** Omit to follow the window's right edge. */
  width?: number;
  /** Omit to follow the window's bottom edge. */
  height?: number;
}

export interface LiquidGlassOptions {
  style?: LiquidGlassStyle;
  /** Normalized sRGB components, or null to remove an existing tint. */
  tintColor?: LiquidGlassColor | null;
  cornerRadius?: number;
  spacing?: number;
  /** Top-left coordinates; null restores a full-window effect. */
  frame?: LiquidGlassFrame | null;
}

export interface LiquidGlassSupport {
  supported: boolean;
  minimumSystemVersion: "26.0";
  reason?: string;
}

export interface LiquidGlassResult {
  supported: boolean;
  applied: boolean;
  attached: boolean;
  reason?: string;
}

interface NativeLiquidGlass {
  support(): LiquidGlassSupport;
  add(windowHandle: Buffer, options?: LiquidGlassOptions): LiquidGlassResult;
  update(windowHandle: Buffer, options?: LiquidGlassOptions): LiquidGlassResult;
  remove(windowHandle: Buffer): LiquidGlassResult;
}

const require = createRequire(__filename);
let nativeBridge: NativeLiquidGlass | null | undefined;
let loadFailureReason: string | undefined;
let explicitAddonPath: string | undefined;

const unsupportedSupport = (reason: string): LiquidGlassSupport => ({
  supported: false,
  minimumSystemVersion: "26.0",
  reason,
});

const unsupportedResult = (reason: string): LiquidGlassResult => ({
  supported: false,
  applied: false,
  attached: false,
  reason,
});

const addonCandidates = () => [
  ...(explicitAddonPath ? [explicitAddonPath] : []),
  path.join(process.resourcesPath, "native", "mimessage_liquid_glass.node"),
  path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "native",
    "liquid-glass",
    "build",
    "Release",
    "mimessage_liquid_glass.node",
  ),
  path.resolve(
    process.cwd(),
    "native",
    "liquid-glass",
    "prebuilds",
    `darwin-${process.arch}`,
    "mimessage_liquid_glass.node",
  ),
  path.resolve(process.cwd(), "native", "liquid-glass", "build", "Release", "mimessage_liquid_glass.node"),
];

const loadBridge = (): NativeLiquidGlass | null => {
  if (nativeBridge !== undefined) {
    return nativeBridge;
  }
  if (process.platform !== "darwin") {
    loadFailureReason = "unsupported-platform";
    nativeBridge = null;
    return nativeBridge;
  }

  const errors: string[] = [];
  for (const candidate of addonCandidates()) {
    try {
      nativeBridge = require(candidate) as NativeLiquidGlass;
      return nativeBridge;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "load-error";
      errors.push(code);
    }
  }
  loadFailureReason = `native-addon-unavailable:${[...new Set(errors)].join(",")}`;
  nativeBridge = null;
  return nativeBridge;
};

const nativeWindowHandle = (window: BrowserWindow) => {
  if (window.isDestroyed()) {
    return null;
  }
  return window.getNativeWindowHandle();
};

/** Override addon discovery before querying support or attaching glass. */
export const setLiquidGlassAddonPath = (addonPath: string | undefined) => {
  explicitAddonPath = addonPath ? path.resolve(addonPath) : undefined;
  nativeBridge = undefined;
  loadFailureReason = undefined;
};

export const getLiquidGlassSupport = (): LiquidGlassSupport => {
  const bridge = loadBridge();
  return bridge?.support() ?? unsupportedSupport(loadFailureReason ?? "native-addon-unavailable");
};

export const addLiquidGlass = (window: BrowserWindow, options: LiquidGlassOptions = {}): LiquidGlassResult => {
  const bridge = loadBridge();
  if (!bridge) {
    return unsupportedResult(loadFailureReason ?? "native-addon-unavailable");
  }
  const handle = nativeWindowHandle(window);
  return handle ? bridge.add(handle, options) : unsupportedResult("window-destroyed");
};

export const updateLiquidGlass = (window: BrowserWindow, options: LiquidGlassOptions = {}): LiquidGlassResult => {
  const bridge = loadBridge();
  if (!bridge) {
    return unsupportedResult(loadFailureReason ?? "native-addon-unavailable");
  }
  const handle = nativeWindowHandle(window);
  return handle ? bridge.update(handle, options) : unsupportedResult("window-destroyed");
};

export const removeLiquidGlass = (window: BrowserWindow): LiquidGlassResult => {
  const bridge = loadBridge();
  if (!bridge) {
    return unsupportedResult(loadFailureReason ?? "native-addon-unavailable");
  }
  const handle = nativeWindowHandle(window);
  return handle ? bridge.remove(handle) : unsupportedResult("window-destroyed");
};
