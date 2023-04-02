import type { CustomScheme } from "electron";
import { app, Menu, protocol, shell } from "electron";
import { addFlags } from "./utils/flags";
import isDev from "electron-is-dev";
import { getDeferred, installExtensions, showApp, showErrorAlert } from "./utils/util";
import registerContextMenu from "electron-context-menu";
import { getMenu } from "./window/menu";
import "./data/ipc";
import { logPath, logStream } from "./constants";
import logger from "./utils/logger";
import { setupRouteHandlers } from "./data/routes";
import { DESKTOP_VERSION } from "./versions";
import { mainAppIconDevPng } from "./window/appMenuBarIcon";
import db, { copyLatestDb, localDbExists } from "./data/database";

addFlags(app);

registerContextMenu({
  showSaveImageAs: true,
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
export const windows: Electron.BrowserWindow[] = [];

let errorTries = 0;
const MAX_ERROR_TRIES = 5;

const amMainInstance = app.requestSingleInstanceLock();
logger.info(`Starting logging to ${logPath}`);
if (!amMainInstance) {
  logStream.write("Not the main instance - quitting");
  app.quit();
} else {
  logStream.write(`--- Launching MiMessage v${DESKTOP_VERSION} ---\n`);

  app.on("web-contents-created", (_event, contents) => {
    contents.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit") {
        return;
      }
      logger.error(`UI crashed: ${details.reason}`);

      showErrorAlert("UI crashed", "The UI stopped unexpected.", logStream);

      setImmediate(() => {
        if (errorTries < MAX_ERROR_TRIES) {
          logStream.write("Retrying UI");
          errorTries += 1;
          contents.reload();
        } else {
          logStream.write("Too many errors - quitting");
          showErrorAlert("Too many errors", "Too many errors - quitting", logStream);
          app.quit();
        }
      });
    });
    contents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
  });
  // Custom Mac OS dock image
  if (isDev) {
    app.dock.setIcon(mainAppIconDevPng);
  }

  const customSchemes = ["file", "mimessage-asset"].map((s) => ({
    scheme: s,
    privileges: {
      secure: true,
      standard: true,
      allowServiceWorkers: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
      supportFetchAPI: true,
    },
  })) as CustomScheme[];
  protocol.registerSchemesAsPrivileged(customSchemes);
  const appReady = getDeferred();
  app.on("ready", async () => {
    if (isDev && !process.argv.includes("--noDevServer")) {
      await installExtensions();
    }
    if (!(await localDbExists())) {
      await copyLatestDb();
    }
    await db.initialize();
    appReady.resolve();
  });

  appReady.promise.then(() => {
    try {
      Menu.setApplicationMenu(getMenu());
    } catch (e) {
      showErrorAlert("Error", "Error setting menu", logStream);
    }
    try {
      showApp();
    } catch (e) {
      showErrorAlert("Window creation error", "Unable to create main window", logStream);
    }
    setupRouteHandlers();
  });

  // We use a single process instance to manage the server, but we
  // do allow multiple windows.
  app.on("second-instance", () => appReady.promise.then(() => showApp()));

  app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (windows.length === 0) {
      // Wait until the ready event - it's possible that this can fire
      // before the app is ready (not sure how) in which case things break!
      appReady.promise.then(() => showApp());
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
