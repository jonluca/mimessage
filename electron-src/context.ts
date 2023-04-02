import { showApp } from "./utils/util";
import type { MenuItemConstructorOptions } from "electron";
import { app, Menu, shell } from "electron";
import isDev from "electron-is-dev";
import db, { copyLatestDb } from "./data/database";

export const getContextMenu = () => {
  const contextMenu = Menu.buildFromTemplate([
    ...(isDev
      ? ([
          {
            role: "toggleDevTools",
            label: "Toggle DevTools",
          },
          { type: "separator" },
        ] as MenuItemConstructorOptions[])
      : []),
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
        await db.reloadDb();
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
    { type: "separator" },
    {
      label: "Quit",
      type: "normal",
      click: async () => {
        app.quit();
      },
    },
  ]);
  return contextMenu;
};
