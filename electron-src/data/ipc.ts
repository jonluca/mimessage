import type { IpcMainInvokeEvent } from "electron";
import { dialog, ipcMain, shell } from "electron"; // deconstructing assignment

import type { SQLDatabase } from "./database";
import db from "./database";
import { getAllContacts, getAuthStatus, requestAccess } from "node-mac-contacts";
import fs from "fs-extra";
import jsonexport from "jsonexport";
import jetpack from "fs-jetpack";
import path from "path";
import * as os from "os";
import { fileTypeFromFile } from "file-type";
import { debugLoggingEnabled } from "../constants";
import logger from "../utils/logger";
import { decodeMessageBuffer } from "../utils/buffer";
import { askForFullDiskAccess, getAuthStatus as getPermissionsStatus } from "node-mac-permissions";
import { setSkipContactsPermsCheck, shouldSkipContactsCheck } from "./options";
export const handleIpc = (event: string, handler: (...args: any[]) => unknown) => {
  ipcMain.handle(event, async (e: IpcMainInvokeEvent, ...args) => {
    await db.initializationPromise;
    if (debugLoggingEnabled) {
      const now = performance.now();
      const result = await handler(...args);
      const time = performance.now() - now;
      logger.info(`IPC ${event} took ${time}ms`);
      return result;
    }
    return handler(...args);
  });
};

handleIpc("openFileAtFolder", (filePath: string) => {
  shell.showItemInFolder(filePath);
});
handleIpc("contacts", async () => {
  const status = getAuthStatus();
  if (status !== "Authorized") {
    await requestAccess();
  }
  const contacts = await getAllContacts(["contactImage", "contactThumbnailImage"]);
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

type EnhancedChat = NonNullable<Awaited<ReturnType<SQLDatabase["getChatList"]>>>[number];
handleIpc(
  "export",
  async (opts: {
    chat: EnhancedChat;
    includeAttachments: boolean;
    fullExport: boolean;
    format: "txt" | "json" | "csv";
  }) => {
    const { chat, fullExport, includeAttachments, format } = opts;

    if (!chat) {
      return;
    }
    const handles = chat.handles || [];
    const contactsInChat = (handles || [])
      .map((handle) => {
        const contact = handle.contact;
        return contact?.parsedName;
      })
      .filter(Boolean);

    const name = chat.display_name || contactsInChat.join(", ") || chat.chat_identifier || "messages";

    const location = await dialog.showSaveDialog({
      defaultPath: `${name}.${format}`,
      filters: [
        { name: "Text", extensions: ["txt"] },
        { name: "JSON", extensions: ["json"] },
        { name: "CSV", extensions: ["csv"] },
      ].filter((l) => l.extensions.includes(format)),
    });
    if (location.canceled) {
      return;
    }
    const messages = await db.getMessagesForChatId(chat.chat_id!);

    type HandleType = typeof handles[number];
    const handleMap: Record<number, HandleType> = {};
    for (const handle of handles) {
      handleMap[handle.ROWID!] = handle;
    }

    const exportedMessages = messages.map((message) => {
      const handle = handleMap[message.handle_id!];
      const parsedName = handle?.contact?.parsedName;
      const handleId = handle?.id || "Unknown";
      const senderName = `${handleId}` + (parsedName ? ` (${parsedName})` : "");
      return {
        text: message.text,
        date: message.date_obj,
        date_read: message.date_read ? message.date_obj_read : undefined,
        date_delivered: message.date_delivered ? message.date_obj_delivered : undefined,
        from: message.is_from_me ? "Me" : senderName,
      };
    });

    const filePath = location.filePath!;
    const outputStream = fs.createWriteStream(filePath);
    switch (opts.format) {
      case "txt":
        for (const message of exportedMessages) {
          outputStream.write(`${message.from} on ${message.date}: ${message.text}\n\n`);
        }
        break;
      case "json":
        if (fullExport) {
          const iterate = async (obj: any) => {
            for (const key in obj) {
              const isObj = typeof obj[key] === "object";
              if (!isObj) {
                continue;
              }
              const k = key as keyof typeof obj;
              const entry = obj[k];
              if (entry instanceof Buffer) {
                try {
                  obj[k] = await decodeMessageBuffer(entry);
                } catch {
                  // ignore
                }
              }
              if (Array.isArray(obj[key]) && Buffer.from(obj[key].slice(0, 6)).toString() === "bplist") {
                try {
                  obj[key] = await decodeMessageBuffer(Buffer.from(obj[key]));
                } catch {
                  // ignore
                }
              }
              if (obj[key] !== null) {
                await iterate(obj[key]);
              }
            }
          };
          for (const message of messages) {
            await iterate(message);
          }
          outputStream.write(JSON.stringify(messages, null, 2));
        } else {
          outputStream.write(JSON.stringify(exportedMessages, null, 2));
        }
        break;
      case "csv":
        const csv = await jsonexport(exportedMessages);
        outputStream.write(csv);
        break;
    }
    outputStream.end();

    if (includeAttachments) {
      const rootDir = path.dirname(filePath);
      const filename = path.basename(filePath).split(".").slice(0, -1).join(".");
      const attachmentsDir = await jetpack.dirAsync(path.join(rootDir, `${filename}-attachments`));
      for (const message of messages) {
        const attachmentFilePath = message.filename;
        if (attachmentFilePath) {
          const cleanedPath = attachmentFilePath.replace("~", os.homedir());
          const attachmentFileName = path.basename(cleanedPath);
          let destination = attachmentsDir.path(`${message.message_id}-${message.transfer_name || attachmentFileName}`);
          if (destination.endsWith("pluginPayloadAttachment")) {
            if (message.mime_type) {
              const newSuffix = message.mime_type.split("/").pop();
              destination = destination.replace(".pluginPayloadAttachment", `.${newSuffix}`);
            } else {
              const fileType = await fileTypeFromFile(cleanedPath);
              if (fileType) {
                destination = destination.replace(".pluginPayloadAttachment", `.${fileType.ext}`);
              }
              // we have to infer the file type based on the file
            }
          }
          await jetpack.copyAsync(cleanedPath, destination);
        }
      }
    }
  },
);
