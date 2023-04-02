import * as path from "path";
import type { MenuItemConstructorOptions } from "electron";
import { app, Menu, shell } from "electron";
import { windows } from "../index";

export const getMenu = () => {
  const menuTemplate: MenuItemConstructorOptions[] = [
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
          console.log("Cmd + Q is pressed");
          windows.forEach((win) => win.close());
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
