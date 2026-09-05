import type { MenuItemConstructorOptions } from "electron";
import { app, dialog, Menu, shell } from "electron";
import isDev from "electron-is-dev";
import { windows } from "../index";
import { showApp } from "../utils/util";
import { requestContactsPerms, requestFullDiskAccess } from "../ipc/ipc-onboarding";
import { clearSkipContactsPermsCheck } from "../options";
import logger, { logPath } from "../utils/logger";
import dbWorker from "../workers/database-worker";
import { getMainWindow, showSettingsWindow } from "./main-window";

export const getMenu = () => {
  const openSettings = async () => {
    try {
      await showSettingsWindow();
    } catch (error) {
      logger.error(`Unable to open Settings: ${String(error)}`);
    }
  };

  const requestPermissions = async () => {
    clearSkipContactsPermsCheck();
    await requestContactsPerms();
    await requestFullDiskAccess();
  };

  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: "&File",
      submenu: [
        {
          label: "New Message",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            const window = getMainWindow();
            if (!window) {
              void showApp();
              return;
            }
            window.show();
            window.focus();
            window.webContents.send("composeNewMessage");
          },
        },
        { type: "separator" },
        { label: "Show Mimessage", click: showApp },
        {
          label: "Load New Messages",
          click: async () => {
            await dbWorker.copyLocalDb();
            app.relaunch();
            app.quit();
          },
        },
        {
          label: "Load Custom chat.db…",
          click: async () => {
            const location = await dialog.showOpenDialog({
              filters: [{ name: "Messages Database", extensions: ["db"] }],
              properties: ["openFile", "showHiddenFiles", "treatPackageAsDirectory"],
            });
            if (location.canceled) {
              return;
            }
            await dbWorker.copyLocalDbFromPath(location.filePaths[0]);
            app.relaunch();
            app.quit();
          },
        },
        {
          label: "iMessage Wrapped…",
          click: () => {
            const window = getMainWindow();
            if (!window) {
              void showApp();
              return;
            }
            window.show();
            window.focus();
            window.webContents.send("openWrapped");
          },
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "&Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut", registerAccelerator: false },
        { role: "copy", registerAccelerator: false },
        { role: "paste", registerAccelerator: false },
        { role: "pasteAndMatchStyle", registerAccelerator: false },
        { role: "delete" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Speech",
          submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
        },
      ],
    },
    {
      label: "&View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev || process.argv.includes("--devTools")
          ? ([
              { type: "separator" },
              { role: "reload" },
              { role: "forceReload" },
              { role: "toggleDevTools" },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: "&Window",
      role: "window",
      submenu: [{ role: "close" }, { role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
    {
      label: "&Help",
      role: "help",
      submenu: [
        {
          label: "Submit Feedback…",
          click: () => {
            void shell.openExternal("mailto:mimessage@jonlu.ca");
          },
        },
        {
          label: "View Mimessage Logs",
          click() {
            shell.showItemInFolder(logPath);
          },
        },
      ],
    },
  ];

  const preferenceItems: MenuItemConstructorOptions[] = [
    { label: "Settings…", accelerator: "CmdOrCtrl+,", click: openSettings },
    {
      label: "Re-Request App Permissions…",
      click: requestPermissions,
    },
  ];

  if (process.platform === "darwin") {
    menuTemplate.unshift({
      label: app.getName(),
      submenu: [
        { role: "about" },
        { type: "separator" },
        ...preferenceItems,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          label: `Quit ${app.getName()}`,
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            logger.info("Cmd + Q is pressed");
            for (const win of [...windows]) {
              if (!win.isDestroyed()) {
                win.close();
              }
            }
            app.quit();
          },
        },
      ],
    });
  } else {
    menuTemplate.unshift({
      label: "&App",
      submenu: [...preferenceItems, { type: "separator" }, { role: "quit" }],
    });
  }

  return Menu.buildFromTemplate(menuTemplate);
};
