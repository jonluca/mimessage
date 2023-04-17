import type { Contact } from "electron-mac-contacts";

export const getContactName = (contact: Contact | null | undefined) => {
  if (!contact) {
    return "";
  }
  if (contact.nickname) {
    return contact.nickname;
  } else {
    if (contact.firstName || contact.lastName) {
      return `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
    }
  }

  return "";
};
