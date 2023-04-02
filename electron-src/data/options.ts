import ElectronStore from "electron-store";

const store = new ElectronStore();
const AUTO_HIDE_SETTING_KEY = "autoHideMenuBar";
export const shouldAutoHideMenu = () => !!store.get(AUTO_HIDE_SETTING_KEY);
