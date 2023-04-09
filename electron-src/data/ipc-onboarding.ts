// deconstructing assignment
import { getAllContacts, getAuthStatus, requestAccess } from "node-mac-contacts";
import logger from "../utils/logger";
import { askForFullDiskAccess, getAuthStatus as getPermissionsStatus } from "node-mac-permissions";
import { setSkipContactsPermsCheck, shouldSkipContactsCheck } from "./options";
import { handleIpc } from "./ipc";

handleIpc("contacts", async () => {
  const status = getAuthStatus();
  if (status !== "Authorized") {
    await requestAccess();
  }
  const contacts = await getAllContacts(["contactThumbnailImage"]);
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
    if (status !== "Authorized") {
      await requestAccess();
    }
    const newStatus = getAuthStatus();

    return newStatus === "Authorized";
  } catch (e) {
    logger.error(e);
    return "unknown";
  }
};
handleIpc("requestContactsPerms", requestContactsPerms);

export const requestFullDiskAccess = async () => {
  const diskAccessStatus = getPermissionsStatus("full-disk-access");
  if (diskAccessStatus === "authorized") {
    return true;
  }
  await askForFullDiskAccess();
  return diskAccessStatus;
};
handleIpc("fullDiskAccess", requestFullDiskAccess);
handleIpc("checkPermissions", async () => {
  const diskAccessStatus = getPermissionsStatus("full-disk-access");
  const contactsStatus = getPermissionsStatus("contacts");
  const skipContactsCheck = shouldSkipContactsCheck();

  return { contactsStatus: skipContactsCheck ? "authorized" : contactsStatus, diskAccessStatus };
});
