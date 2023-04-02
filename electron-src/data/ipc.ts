import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import db from "./database";
import { requestAccess, getAuthStatus, getAllContacts } from "node-mac-contacts";

export const handleIpc = (event: string, handler: (...args: any[]) => unknown) => {
  ipcMain.handle(event, async (event: IpcMainInvokeEvent, ...args) => {
    await db.initializationPromise;
    return handler(...args);
  });
};

handleIpc("contacts", async () => {
  const status = getAuthStatus();
  if (status !== "Authorized") {
    await requestAccess();
  }
  const contacts = await getAllContacts();
  return contacts;
});
