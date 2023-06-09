import * as path from "path";
import type { MenuItemConstructorOptions } from "electron";
import { app, dialog, Menu, shell } from "electron";
import { windows } from "../index";
import { showApp } from "../utils/util";
import { requestContactsPerms, requestFullDiskAccess } from "../ipc/ipc-onboarding";
import { clearSkipContactsPermsCheck } from "../options";
import { copyDbAtPath, copyLatestDb } from "../data/db-file-utils";
import logger, { logPath } from "../utils/logger";

export const getMenu = () => {
  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: "&App",
      submenu: [
        {
          label: "Show App",
          type: "normal",
          click: showApp,
        },
        {
          label: "Load new messages",
          type: "normal",
          click: async () => {
            await copyLatestDb();
            app.relaunch();
            app.exit(0);
          },
        },
        {
          label: "Load custom chat.db",
          type: "normal",
          click: async () => {
            const location = await dialog.showOpenDialog({
              filters: [{ name: "SQlite DB", extensions: ["db"] }],
              properties: ["openFile", "showHiddenFiles", "treatPackageAsDirectory"],
            });
            if (location.canceled) {
              return;
            }
            await copyDbAtPath(location.filePaths[0]);
            app.relaunch();
            app.exit(0);
          },
        },
        { type: "separator" },
        {
          label: "Re-Request App Permissions",
          type: "normal",
          click: async () => {
            clearSkipContactsPermsCheck();
            await requestContactsPerms();
            await requestFullDiskAccess();
          },
        },
        { type: "separator" },
        {
          label: "Submit Feedback",
          type: "normal",
          click: () => {
            shell.openExternal("mailto:mimessage@jonlu.ca");
          },
        },
        {
          label: "View Logs",
          type: "normal",
          click: () => {
            shell.showItemInFolder(logPath);
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          type: "normal",
          click: async () => {
            app.quit();
          },
        },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
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
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "&Window",
      role: "window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
    {
      label: "&Help",
      role: "help",
      submenu: [
        {
          label: "View Mimessage logs",
          click() {
            shell.showItemInFolder(path.join(app.getPath("logs"), "last-run.log"));
          },
        },
      ],
    },
  ];

  const macMenu: MenuItemConstructorOptions = {
    label: app.getName(),
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      {
        label: "Quit",
        accelerator: "CmdOrCtrl+Q",
        click: () => {
          logger.info("Cmd + Q is pressed");
          windows.forEach((win) => win.close());
          app.quit();
        },
      },
    ],
  };
  menuTemplate.unshift(macMenu);

  // Add to Edit menu
  (menuTemplate[1].submenu as MenuItemConstructorOptions[]).push(
    { type: "separator" },
    {
      label: "Speech",
      submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
    },
  );

  // Window menu
  menuTemplate[3].submenu = [
    { role: "close" },
    { role: "minimize" },
    { role: "zoom" },
    { type: "separator" },
    { role: "front" },
  ];

  return Menu.buildFromTemplate(menuTemplate);
};
