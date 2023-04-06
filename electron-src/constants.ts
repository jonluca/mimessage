import path from "path";
import { app, nativeImage } from "electron";
import { createWriteStream } from "fs";
import isDev from "electron-is-dev";

const APP_PATH = app.getAppPath();
export const RESOURCES_PATH = APP_PATH.endsWith("app.asar")
  ? path.dirname(APP_PATH) // If we're bundled, resources are above the bundle
  : APP_PATH.split("build")[0]; // Otherwise everything is in the root of the app
export const LOGS_PATH = app.getPath("logs");
export const logPath = path.join(LOGS_PATH, `run-${new Date().toISOString()}.log`);
export const logStream = createWriteStream(logPath);
export const mainAppIconDevPng = nativeImage.createFromPath(path.join(RESOURCES_PATH, "assets", "icon.png"));
export const debugLoggingEnabled = isDev && process.env.DEBUG_LOGGING === "true";
