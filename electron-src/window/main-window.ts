import type { BrowserWindow } from "electron";
import { app, screen } from "electron";
import windowStateKeeper from "electron-window-state";
import createWindow from "./create-window";
import { join } from "path";
import { mainAppIconDevPng } from "../constants";
import isDev from "electron-is-dev";
import { showErrorAlert, withRetries } from "../utils/util";
import prepareNext from "../utils/next-helper";
import logger, { logStream } from "../utils/logger";

const setupNext = async () => {
  try {
    await withRetries(() =>
      prepareNext(
        {
          development: "../src",
          production: join(app.getAppPath(), "src"),
        },
        3020,
      ),
    );
  } catch (e) {
    logger.error(`Failed to prepare next: ${e}`);
    showErrorAlert("Error", "Failed to prepare next");
    app.exit(-1);
    return;
  }
};

let setupNextPromise: Promise<void> | null = null;
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let mainWindowBoundsBeforeSetup: Electron.Rectangle | null = null;
const setupBaseWindowEventHandlers = (window: BrowserWindow) => {
  window.webContents.on("console-message", (details) => {
    logStream.write(`${details.level.toUpperCase()}: ${details.message}\n`);
  });

  window.on("ready-to-show", function () {
    window!.show();
    window!.focus();
  });
};

export const createMainWindow = async () => {
  setupNextPromise ??= setupNext();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const nativeDefaultWidth = Math.max(930, Math.min(width, Math.round(width / 2)));

  const windowState = windowStateKeeper({
    defaultWidth: nativeDefaultWidth,
    defaultHeight: height,
  });

  mainWindow = createWindow("main", {
    title: "Mimessage",
    minWidth: 660,
    minHeight: 640,
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    icon: mainAppIconDevPng,
  });
  const window = mainWindow;
  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  // mainWindow.once("ready-to-show", () => {
  //   if (!isDev) {
  //     mainWindow.setAlwaysOnTop(true, "floating", 1);
  //     mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  //   }
  // });

  windowState.manage(window);

  const url = isDev ? "http://localhost:3020/" : "mimessage-app://app/index.html";

  setupBaseWindowEventHandlers(window);
  await setupNextPromise;

  await window.loadURL(url);
  try {
    if (isDev || process.argv.includes("--devTools")) {
      window.webContents.openDevTools({ mode: "undocked" });
    }
  } catch (e) {
    logStream.write(`Error opening devtools: ${e}\n`);
  }
  window.show();
  return window;
};

export const getMainWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);

export const setMainWindowSetupMode = (active: boolean) => {
  const window = getMainWindow();
  if (!window) {
    return;
  }
  if (active) {
    mainWindowBoundsBeforeSetup ??= window.getBounds();
    window.setResizable(false);
    window.setMinimumSize(600, 400);
    window.setSize(600, 400, true);
    window.center();
    return;
  }

  const previousBounds = mainWindowBoundsBeforeSetup;
  mainWindowBoundsBeforeSetup = null;
  window.setResizable(true);
  window.setMinimumSize(660, 640);
  if (previousBounds) {
    window.setBounds(previousBounds, true);
  }
};

export const showSettingsWindow = async () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  setupNextPromise ??= setupNext();
  settingsWindow = createWindow("settings", {
    title: "General",
    width: 600,
    height: 699,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    transparent: true,
    backgroundColor: "#00000000",
    vibrancy: "under-window",
    trafficLightPosition: { x: 10, y: 9 },
    icon: mainAppIconDevPng,
  });
  settingsWindow.setSize(600, 699, false);
  const window = settingsWindow;
  window.once("closed", () => {
    if (settingsWindow === window) {
      settingsWindow = null;
    }
  });
  setupBaseWindowEventHandlers(window);
  await setupNextPromise;
  const url = isDev ? "http://localhost:3020/settings" : "mimessage-app://app/settings.html";
  await window.loadURL(url);
  window.show();
  return window;
};
