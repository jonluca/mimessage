import { BrowserWindow, screen } from "electron";
import Store from "electron-store";
import { join } from "path";
import { windows } from "../index";
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
      x: (bounds.width - defaultSize.width) / 2,
      y: (bounds.height - defaultSize.height) / 2,
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
  const win = new BrowserWindow({
    ...options,
    ...state,
    vibrancy: "sidebar",
    visualEffectState: "active",
    frame: false,
    transparent: true,
    hasShadow: true,
    titleBarStyle: "hiddenInset",
    // transparent: true,
    title: "Mimessage",
    webPreferences: {
      nodeIntegration: false,
      devTools: true,
      contextIsolation: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: true,
      preload: join(__dirname, "utils/preload.js"),
      ...options.webPreferences,
    },
  });
  windows.push(win);

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
