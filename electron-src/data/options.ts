import ElectronStore from "electron-store";
import { ipcMain } from "electron";
const store = new ElectronStore();
const AUTO_HIDE_SETTING_KEY = "autoHideMenuBar";
const SKIP_CONTACTS_PERMS_CHECK = "skipContactsPermsCheck";
export const shouldAutoHideMenu = () => !!store.get(AUTO_HIDE_SETTING_KEY);
export const shouldSkipContactsCheck = () => !!store.get(SKIP_CONTACTS_PERMS_CHECK);
export const setSkipContactsPermsCheck = () => store.set(SKIP_CONTACTS_PERMS_CHECK, true);
export const clearSkipContactsPermsCheck = () => store.delete(SKIP_CONTACTS_PERMS_CHECK);
// IPC listener
ipcMain.handle("electron-store-get", async (event, val) => {
  return store.get(val);
});
ipcMain.handle("electron-store-delete", async (event, val) => {
  return store.delete(val);
});

ipcMain.handle("electron-store-has", async (event, val) => {
  return store.has(val);
});
ipcMain.handle("electron-store-set", async (event, key, val) => {
  return store.set(key, val);
});
