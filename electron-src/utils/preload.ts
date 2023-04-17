import type { IpcRenderer } from "electron";
import { ipcRenderer } from "electron";
interface Store {
  get: (key: string) => Promise<any>;
  delete: (key: string) => Promise<any>;
  has: (key: string) => Promise<boolean>;
  set: (key: string, val: any) => Promise<void>;
  // any other methods you've defined...
}
declare global {
  // eslint-disable-next-line no-var
  var ipcRenderer: IpcRenderer;
  // eslint-disable-next-line no-var
  var store: Store;
  // eslint-disable-next-line no-var
}

// Since we disabled nodeIntegration we can reintroduce
// needed node functionality here
process.once("loaded", () => {
  global.ipcRenderer = ipcRenderer;
  global.store = {
    get(key: string) {
      return ipcRenderer.invoke("electron-store-get", key);
    },
    has(key: string) {
      return ipcRenderer.invoke("electron-store-has", key);
    },
    delete(key: string) {
      return ipcRenderer.invoke("electron-store-delete", key);
    },
    set(property: string, val: any) {
      return ipcRenderer.invoke("electron-store-set", property, val);
    },
    // Other method you want to add like has(), reset(), etc.
  };
});
