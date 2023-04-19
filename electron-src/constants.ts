import path from "path";
import { app, nativeImage } from "electron";
import isDev from "electron-is-dev";

const APP_PATH = app.getAppPath();
export const RESOURCES_PATH = APP_PATH.endsWith("app.asar")
  ? path.dirname(APP_PATH) // If we're bundled, resources are above the bundle
  : APP_PATH.split("build")[0]; // Otherwise everything is in the root of the app
export const mainAppIconDevPng = nativeImage.createFromPath(path.join(RESOURCES_PATH, "assets", "icon.png"));
export const debugLoggingEnabled = isDev && process.env.DEBUG_LOGGING === "true";
