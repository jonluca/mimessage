import { BrowserWindow, screen } from "electron";
import Store from "electron-store";
import isDev from "electron-is-dev";
import { join } from "path";
import { windows } from "../index";
import { addLiquidGlass, getLiquidGlassSupport, removeLiquidGlass } from "../native/liquid-glass";
import logger from "../utils/logger";
// import prepareNext from "electron-next";
const windowWithinBounds = (windowState: WindowState, bounds: Electron.Rectangle) => {
  return (
    windowState.x >= bounds.x &&
    windowState.y >= bounds.y &&
    windowState.x + windowState.width <= bounds.x + bounds.width &&
    windowState.y + windowState.height <= bounds.y + bounds.height
  );
};

interface WindowState {
  width: number;
  height: number;
  x: number;
  y: number;
}

export default function createWindow(windowName: string, options: Partial<Electron.BrowserWindowConstructorOptions>) {
  const key = "window-state";
  const name = `window-state-${windowName}`;
  const store = new Store({ name });
  const defaultSize = {
    width: options.width ?? 0,
    height: options.height ?? 0,
  };
  const resetToDefaults = (): WindowState => {
    const bounds = screen.getPrimaryDisplay().bounds;
    return Object.assign({}, defaultSize, {
      x: bounds.x + (bounds.width - defaultSize.width) / 2,
      y: bounds.y + (bounds.height - defaultSize.height) / 2,
    });
  };
  const ensureVisibleOnSomeDisplay = (): WindowState => {
    const windowState = store.get(key, defaultSize) as WindowState;
    const visible = screen.getAllDisplays().some((display) => {
      return windowWithinBounds(windowState, display.bounds);
    });
    if (!visible) {
      // Window is partially or fully not visible now.
      // Reset it to safe defaults.
      return resetToDefaults();
    }
    return windowState;
  };

  const state = ensureVisibleOnSomeDisplay();
  const configuredVibrancy = options.vibrancy ?? "sidebar";
  const fallbackVibrancy = configuredVibrancy === "appearance-based" ? "sidebar" : configuredVibrancy;
  const liquidGlassSupport = getLiquidGlassSupport();
  const shouldUseNativeLiquidGlass = liquidGlassSupport.supported;
  const rendererArguments = options.webPreferences?.additionalArguments ?? [];
  const win = new BrowserWindow({
    ...options,
    ...state,
    show: options.show ?? false,
    vibrancy: shouldUseNativeLiquidGlass ? undefined : fallbackVibrancy,
    visualEffectState: "followWindow",
    frame: options.frame ?? false,
    transparent: options.transparent ?? true,
    backgroundColor: options.backgroundColor ?? "#00000000",
    hasShadow: true,
    titleBarStyle: options.titleBarStyle ?? "hiddenInset",
    trafficLightPosition: options.trafficLightPosition ?? { x: 20, y: 18 },
    // transparent: true,
    title: options.title ?? "Mimessage",
    webPreferences: {
      ...options.webPreferences,
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: isDev || process.argv.includes("--devTools"),
      nodeIntegration: false,
      additionalArguments: [
        ...rendererArguments,
        ...(shouldUseNativeLiquidGlass ? ["--mimessage-native-liquid-glass"] : []),
      ],
      preload: join(__dirname, "utils/preload.js"),
      sandbox: true,
      webSecurity: true,
    },
  });

  let liquidGlassAttached = false;
  const setRendererGlassState = (active: boolean) => {
    const updateClass = () => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) {
        return;
      }
      const operation = active ? "add" : "remove";
      void win.webContents
        .executeJavaScript(`document.documentElement.classList.${operation}("native-liquid-glass")`, true)
        .catch((error) => logger.warn(`Unable to update native glass renderer state: ${String(error)}`));
    };
    if (win.webContents.isLoadingMainFrame()) {
      win.webContents.once("dom-ready", updateClass);
    } else {
      updateClass();
    }
  };
  const restoreVibrancyFallback = (reason: string) => {
    setRendererGlassState(false);
    if (process.platform === "darwin") {
      win.setVibrancy(fallbackVibrancy);
    }
    logger.warn(`Native Liquid Glass unavailable for ${windowName}; using ${fallbackVibrancy} vibrancy (${reason})`);
  };
  const attachNativeLiquidGlass = () => {
    const result = addLiquidGlass(win, {
      cornerRadius: 0,
      spacing: 0,
      style: "regular",
    });
    liquidGlassAttached = result.attached && (result.applied || result.reason === "already-attached");
    if (liquidGlassAttached) {
      logger.info(`Using public AppKit Liquid Glass for ${windowName}`);
    }
    return result;
  };

  if (shouldUseNativeLiquidGlass) {
    const result = attachNativeLiquidGlass();
    if (!liquidGlassAttached && result.reason === "window-not-ready") {
      win.once("ready-to-show", () => {
        const retry = attachNativeLiquidGlass();
        if (!liquidGlassAttached) {
          restoreVibrancyFallback(retry.reason ?? "attach-failed");
        }
      });
    } else if (!liquidGlassAttached) {
      restoreVibrancyFallback(result.reason ?? "attach-failed");
    }
  }

  windows.push(win);
  win.once("close", () => {
    if (liquidGlassAttached) {
      removeLiquidGlass(win);
      liquidGlassAttached = false;
    }
  });
  win.once("closed", () => {
    const index = windows.indexOf(win);
    if (index >= 0) {
      windows.splice(index, 1);
    }
  });

  const saveState = () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      Object.assign(state, getCurrentPosition());
    }
    store.set(key, state);
  };

  win.on("close", saveState);
  const getCurrentPosition = (): WindowState => {
    const position = win.getPosition();
    const size = win.getSize();
    return {
      x: position[0],
      y: position[1],
      width: size[0],
      height: size[1],
    };
  };

  return win;
}
