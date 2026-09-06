import "./utils/dns-cache";
import { app, Menu, nativeTheme, Notification, protocol, shell, systemPreferences } from "electron";

// Global imports to monkeypatch/polyfill/register
import "./semantic-search/semantic-search";
import "./ipc/ipc";
import "./options";
import "./ipc/ipc-onboarding";
// normal imports
import type { CustomScheme } from "electron";
import isDev from "electron-is-dev";
import { getDeferred, installExtensions, showApp, showErrorAlert } from "./utils/util";
import registerContextMenu from "electron-context-menu";
import { getMenu } from "./window/menu";

import { mainAppIconDevPng } from "./constants";
import logger, { logPath, logStream } from "./utils/logger";
import { setupRouteHandlers } from "./utils/routes";
import { DESKTOP_VERSION } from "./versions";
import { autoUpdater } from "electron-updater";
import dbWorker from "./workers/database-worker";

registerContextMenu({
  showSaveImageAs: true,
  showSaveVideo: true,
  showSaveImage: true,
  showSaveVideoAs: true,
  showCopyLink: true,
  showSaveLinkAs: true,
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
export const windows: Electron.BrowserWindow[] = [];

let errorTries = 0;
const MAX_ERROR_TRIES = 5;

const syncNativeThemeWithSystem = () => {
  if (process.platform !== "darwin") {
    nativeTheme.themeSource = "system";
    return;
  }
  // Chromium can report a stale light appearance on newer macOS builds even
  // while AppKit is dark. The system default and distributed notification are
  // the same sources native Messages follows, and setting themeSource also
  // updates renderer prefers-color-scheme queries.
  const interfaceStyle = systemPreferences.getUserDefault("AppleInterfaceStyle", "string");
  const themeSource = interfaceStyle === "Dark" ? "dark" : "light";
  if (nativeTheme.themeSource !== themeSource) {
    nativeTheme.themeSource = themeSource;
  }
  logger.info(`Using ${themeSource} macOS appearance (native dark: ${nativeTheme.shouldUseDarkColors})`);
};

syncNativeThemeWithSystem();

const isApplicationUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    if (isDev) {
      return url.origin === "http://localhost:3020";
    }
    return url.protocol === "mimessage-app:" && url.host === "app" && !url.username && !url.password;
  } catch {
    return false;
  }
};

const isSafeExternalUrl = (rawUrl: string) => {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
};

const openSafeExternalUrl = (rawUrl: string) => {
  if (!isSafeExternalUrl(rawUrl)) {
    logger.warn(`Blocked external URL with unsupported protocol: ${rawUrl}`);
    return;
  }
  void shell.openExternal(rawUrl).catch((error) => logger.error(`Unable to open external URL: ${String(error)}`));
};

const amMainInstance = app.requestSingleInstanceLock();
logger.info(`Starting logging to ${logPath}`);
if (!amMainInstance) {
  logStream.write("Not the main instance - quitting");
  app.quit();
} else {
  logStream.write(`--- Launching MiMessage v${DESKTOP_VERSION} ---\n`);
  autoUpdater.logger = logger;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "jonluca",
    repo: "mimessage",
  });
  autoUpdater.on("error", (error) => {
    logger.warn(`Automatic update failed: ${String(error)}`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (Notification.isSupported()) {
      new Notification({
        title: "A Mimessage update is ready",
        body: `Version ${info.version} will be installed when you quit Mimessage.`,
      }).show();
    }
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit") {
        return;
      }
      logger.error(`UI crashed: ${details.reason}`);

      showErrorAlert("UI crashed", "The UI stopped unexpectedly.", logStream);

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
      openSafeExternalUrl(url);
      return { action: "deny" };
    });
    const guardNavigation = (details: Electron.Event & { url: string }) => {
      if (isApplicationUrl(details.url)) {
        return;
      }
      details.preventDefault();
      openSafeExternalUrl(details.url);
    };
    contents.on("will-frame-navigate", guardNavigation);
    contents.on("will-redirect", guardNavigation);
  });

  const customSchemes: CustomScheme[] = [
    {
      scheme: "mimessage-app",
      privileges: {
        codeCache: true,
        secure: true,
        standard: true,
        supportFetchAPI: true,
      },
    },
    {
      scheme: "mimessage-asset",
      privileges: {
        corsEnabled: true,
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: true,
      },
    },
  ];
  protocol.registerSchemesAsPrivileged(customSchemes);
  const appReady = getDeferred();
  void app
    .whenReady()
    .then(async () => {
      if (isDev && !process.argv.includes("--noDevExtensions")) {
        await installExtensions();
      }
      if (isDev && process.platform === "darwin") {
        app.dock?.setIcon(mainAppIconDevPng);
        app.setName("MiMessage Dev");
      }
      await setupRouteHandlers();
      await dbWorker.startWorker();
      syncNativeThemeWithSystem();
      if (process.platform === "darwin") {
        systemPreferences.subscribeNotification("AppleInterfaceThemeChangedNotification", syncNativeThemeWithSystem);
      }
      dbWorker.setupHandlers();
      appReady.resolve();
    })
    .catch((error) => {
      logger.error(`Application startup failed: ${String(error)}`);
      appReady.reject(error instanceof Error ? error : new Error(String(error)));
    });

  void appReady.promise
    .then(async () => {
      try {
        Menu.setApplicationMenu(getMenu());
      } catch {
        showErrorAlert("Error", "Error setting menu", logStream);
      }
      try {
        await showApp();
      } catch (error) {
        logger.error(error);
        showErrorAlert("Window creation error", "Unable to create main window", logStream);
      }
      try {
        const update = await autoUpdater.checkForUpdates();
        await update?.downloadPromise;
      } catch (error) {
        logger.warn(`Unable to check for or download an automatic update: ${String(error)}`);
      }
    })
    .catch((error) => logger.error(`Post-startup task failed: ${String(error)}`));

  // We use a single process instance to manage the server, but we
  // do allow multiple windows.
  app.on("second-instance", () => {
    void appReady.promise.then(() => showApp()).catch((error) => logger.error(error));
  });

  app.on("activate", () => {
    // Dock activation should restore a live window or recreate one after the
    // last window was closed. Wait for startup because activation can arrive
    // before the worker and custom protocols are ready.
    void appReady.promise.then(() => showApp()).catch((error) => logger.error(error));
  });

  app.on("window-all-closed", () => {
    // Native macOS apps remain available in the Dock after their last window
    // closes. The activate handler above recreates a window on the next click.
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  let shutdownComplete = false;
  let shutdownPromise: Promise<void> | undefined;
  app.on("before-quit", (event) => {
    if (shutdownComplete) {
      return;
    }
    event.preventDefault();
    shutdownPromise ??= (async () => {
      logStream.write("Quitting");
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          dbWorker.stopWorker(),
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, 5_000);
            timeout.unref();
          }),
        ]);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
        await new Promise<void>((resolve) => logStream.end(resolve));
        shutdownComplete = true;
        app.quit();
      }
    })();
  });
}
