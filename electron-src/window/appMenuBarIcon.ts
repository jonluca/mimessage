import * as path from "path";
import { nativeImage, Tray } from "electron";
import { RESOURCES_PATH } from "../constants";
import { getContextMenu } from "../context";

// Prepare the src once the app is ready
export let appMenuBarIcon: Tray | undefined;
const iconPath = path.join(RESOURCES_PATH, "assets", "icon.png");
const image = nativeImage.createFromPath(iconPath);

export const mainAppIconDevPng = nativeImage.createFromPath(path.join(RESOURCES_PATH, "assets", "icon.png"));
export const setAppIcon = () => {
  if (!appMenuBarIcon) {
    const resized = image.resize({ width: 19, quality: "best" });
    resized.setTemplateImage(true);
    appMenuBarIcon = new Tray(resized);
  }
  return appMenuBarIcon;
};
export const updateMenu = () => {
  appMenuBarIcon?.setContextMenu(getContextMenu());
};
