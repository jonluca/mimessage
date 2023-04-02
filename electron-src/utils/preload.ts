import type { IpcRenderer } from "electron";
import { ipcRenderer } from "electron";

declare global {
  // eslint-disable-next-line no-var
  var ipcRenderer: IpcRenderer;
}
// Since we disabled nodeIntegration we can reintroduce
// needed node functionality here
process.once("loaded", () => {
  global.ipcRenderer = ipcRenderer;
});
