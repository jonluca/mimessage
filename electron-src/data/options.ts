import ElectronStore from "electron-store";

const store = new ElectronStore();
const AUTO_HIDE_SETTING_KEY = "autoHideMenuBar";
const SKIP_CONTACTS_PERMS_CHECK = "skipContactsPermsCheck";
export const shouldAutoHideMenu = () => !!store.get(AUTO_HIDE_SETTING_KEY);
export const shouldSkipContactsCheck = () => !!store.get(SKIP_CONTACTS_PERMS_CHECK);
export const setSkipContactsPermsCheck = () => store.set(SKIP_CONTACTS_PERMS_CHECK, true);
export const clearSkipContactsPermsCheck = () => store.delete(SKIP_CONTACTS_PERMS_CHECK);
