// deconstructing assignment
import { getAllContacts, getAuthStatus, requestAccess } from "electron-mac-contacts";
import { shell } from "electron";
import { open } from "node:fs/promises";
import logger from "../utils/logger";
import { setSkipContactsPermsCheck, shouldSkipContactsCheck } from "../options";
import { messagesDb } from "../utils/constants";
import { handleIpc } from "./ipc";
import { v4 as uuid } from "uuid";

type PermissionStatus = "authorized" | "denied" | "not determined" | "restricted" | "unknown";

const FULL_DISK_ACCESS_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
const CONTACTS_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts";
const PRIVACY_SETTINGS = {
  contacts: CONTACTS_SETTINGS,
  "full-disk": FULL_DISK_ACCESS_SETTINGS,
} as const;

const hasContactsAccess = (status: string) => status === "Authorized" || status === "Limited";

const contactsPermissionStatus = (): PermissionStatus => {
  const status = getAuthStatus();
  if (hasContactsAccess(status)) {
    return "authorized";
  }
  if (status === "Denied") {
    return "denied";
  }
  if (status === "Restricted") {
    return "restricted";
  }
  return "not determined";
};

export const messagesDatabasePermissionStatus = async (): Promise<PermissionStatus> => {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    // An actual read of the protected database is authoritative. Generic TCC
    // status APIs are not reliable for Full Disk Access on current macOS.
    handle = await open(messagesDb, "r");
    return "authorized";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      return "denied";
    }
    if (code === "ENOENT") {
      return "not determined";
    }
    logger.error(`Unable to probe Messages database access: ${String(error)}`);
    return "unknown";
  } finally {
    await handle?.close();
  }
};

handleIpc("contacts", async () => {
  const status = getAuthStatus();
  if (!hasContactsAccess(status)) {
    return [];
  }
  const contacts = await getAllContacts(["contactThumbnailImage"]);
  for (const c of contacts) {
    c.identifier = c.identifier || uuid();
  }
  return contacts;
});
handleIpc("skipContactsCheck", () => {
  setSkipContactsPermsCheck();
});

export const requestContactsPerms = async () => {
  try {
    const skipContactsCheck = shouldSkipContactsCheck();
    if (skipContactsCheck) {
      return true;
    }
    const status = getAuthStatus();
    if (status === "Not Determined") {
      await requestAccess();
    } else if (status === "Denied" || status === "Restricted") {
      await shell.openExternal(CONTACTS_SETTINGS);
    }
    const newStatus = getAuthStatus();

    return hasContactsAccess(newStatus);
  } catch (e) {
    logger.error(e);
    return "unknown";
  }
};
handleIpc("requestContactsPerms", requestContactsPerms);

export const requestFullDiskAccess = async () => {
  const diskAccessStatus = await messagesDatabasePermissionStatus();
  if (diskAccessStatus === "authorized") {
    return true;
  }
  await shell.openExternal(FULL_DISK_ACCESS_SETTINGS);
  return diskAccessStatus;
};
handleIpc("fullDiskAccess", requestFullDiskAccess);
handleIpc("openPrivacySettings", async (pane: keyof typeof PRIVACY_SETTINGS) => {
  const destination = PRIVACY_SETTINGS[pane];
  if (!destination) {
    throw new Error("Unknown privacy settings pane");
  }
  await shell.openExternal(destination);
});
handleIpc("checkPermissions", async () => {
  const diskAccessStatus = await messagesDatabasePermissionStatus();
  const contactsStatus = contactsPermissionStatus();
  const skipContactsCheck = shouldSkipContactsCheck();
  return { contactsStatus: skipContactsCheck ? "authorized" : contactsStatus, diskAccessStatus };
});
