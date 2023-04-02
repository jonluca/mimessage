import type { BrowserWindow } from "electron";
import { app, screen } from "electron";
import windowStateKeeper from "electron-window-state";
import createWindow from "./create-window";
import { join } from "path";
import { logStream } from "../constants";
import isDev from "electron-is-dev";
import { format } from "url";
import { appMenuBarIcon, mainAppIconDevPng, setAppIcon, updateMenu } from "./appMenuBarIcon";
import { getContextMenu } from "../context";
import { showErrorAlert, withRetries } from "../utils/util";
import prepareNext from "../utils/next-helper";
import logger from "../utils/logger";
import { windows } from "../index";

const createMenubarIcon = () => {
  try {
    setAppIcon();
    appMenuBarIcon?.setContextMenu(getContextMenu());
    appMenuBarIcon?.setIgnoreDoubleClickEvents(true);
    appMenuBarIcon?.on("click", () => {
      updateMenu();
    });
  } catch (e) {
    console.error(e);
  }
};

const setupNext = async () => {
  try {
    await withRetries(() =>
      prepareNext(
        {
          development: "../src",
          production: join(app.getAppPath(), "src"),
        },
        3000,
      ),
    );
  } catch (e) {
    logger.error(`Failed to prepare next: ${e}`);
    showErrorAlert("Error", "Failed to prepare next");
    app.quit();
    return;
  }
};

let setupNextPromise: Promise<void> | null = null;
const setupBaseWindowEventHandlers = (window: BrowserWindow) => {
  window.webContents.on("console-message", (_event: any, level: any, message: string) => {
    const levelName = ["VERBOSE", "INFO", "WARN", "ERROR"][level];
    logStream.write(`${levelName}: ${message}\n`);
  });

  window.on("ready-to-show", function () {
    window!.show();
    window!.focus();
  });

  window.on("closed", () => {
    const index = windows.indexOf(window);
    if (index > -1) {
      windows.splice(index, 1);
    }
  });
};

export const createMainWindow = async () => {
  setupNextPromise ??= setupNext();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const windowState = windowStateKeeper({
    defaultWidth: width,
    defaultHeight: height,
  });

  const mainWindow = createWindow("main", {
    title: "Mimessage",
    minWidth: 930,
    minHeight: 640,
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    icon: mainAppIconDevPng,
  });

  // mainWindow.once("ready-to-show", () => {
  //   if (!isDev) {
  //     mainWindow.setAlwaysOnTop(true, "floating", 1);
  //     mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  //   }
  // });

  windowState.manage(mainWindow);

  const url = isDev
    ? "http://localhost:3000/"
    : format({
        pathname: join(__dirname, "../../src/out/index.html"),
        protocol: "file:",
        slashes: true,
      });

  setupBaseWindowEventHandlers(mainWindow);
  createMenubarIcon();
  await setupNextPromise;

  await mainWindow.loadURL(url);
  try {
    if (isDev || process.argv.includes("--devTools")) {
      mainWindow.webContents.openDevTools({ mode: "undocked" });
    }
  } catch (e) {
    logStream.write(`Error opening devtools: ${e}\n`);
  }
  mainWindow.show();
  return mainWindow;
};
