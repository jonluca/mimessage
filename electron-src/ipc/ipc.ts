import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from "electron";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import isDev from "electron-is-dev";
import type { SQLDatabase } from "../data/database";
import fs from "fs-extra";
import jsonexport from "jsonexport";
import path from "path";
import * as os from "os";
import { finished } from "node:stream/promises";
import { debugLoggingEnabled } from "../constants";
import logger from "../utils/logger";
import { decodeMessageBuffer } from "../utils/buffer";
import dbWorker from "../workers/database-worker";
import { fileTypeFromFile } from "file-type";
import { resolveAttachmentPath } from "../utils/routes";
import { parseBuffer as parseBinaryPlist } from "bplist-universal";
import { getConversationExportIds } from "../../src/utils/conversation-export";
import { copyExportAttachment, writeStagedExport } from "../utils/staged-export";

const getSafeAttachmentExportName = (requestedName: string, fallbackName: string) => {
  const normalizedName = requestedName.replaceAll("\\", "/").replaceAll("\0", "");
  const leafName = path.posix.basename(normalizedName).trim();
  const withoutControlCharacters = [...leafName]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("");
  const safeName =
    withoutControlCharacters && ![".", ".."].includes(withoutControlCharacters)
      ? withoutControlCharacters
      : fallbackName;

  // Leave room for the message/attachment IDs and avoid ENAMETOOLONG on
  // database-controlled transfer names.
  return safeName.slice(0, 180) || "attachment";
};

const escapeSpreadsheetFormula = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  let index = 0;
  while (index < value.length) {
    const codePoint = value.codePointAt(index) ?? 0;
    if (codePoint > 32 && codePoint !== 127) {
      break;
    }
    index += codePoint > 0xffff ? 2 : 1;
  }
  return ["=", "+", "-", "@"].includes(value[index] || "") ? `'${value}` : value;
};

const isTrustedRendererUrl = (rawUrl: string) => {
  try {
    const senderUrl = new URL(rawUrl);
    if (isDev) {
      return senderUrl.origin === "http://localhost:3020";
    }
    return (
      senderUrl.protocol === "mimessage-app:" && senderUrl.host === "app" && !senderUrl.username && !senderUrl.password
    );
  } catch {
    return false;
  }
};

const isTrustedRenderer = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  return Boolean(frame && frame === event.sender.mainFrame && isTrustedRendererUrl(frame.url));
};

export const handleIpc = (event: string, handler: (...args: any[]) => unknown) => {
  ipcMain.handle(event, async (ipcEvent: IpcMainInvokeEvent, ...args) => {
    if (!isTrustedRenderer(ipcEvent)) {
      logger.warn(`Rejected IPC ${event} from untrusted renderer`);
      throw new Error("Untrusted IPC sender");
    }
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

const handleIpcWithEvent = (event: string, handler: (ipcEvent: IpcMainInvokeEvent, ...args: any[]) => unknown) => {
  ipcMain.handle(event, async (ipcEvent: IpcMainInvokeEvent, ...args) => {
    if (!isTrustedRenderer(ipcEvent)) {
      logger.warn(`Rejected IPC ${event} from untrusted renderer`);
      throw new Error("Untrusted IPC sender");
    }
    return handler(ipcEvent, ...args);
  });
};

handleIpc("openFileAtFolder", async (filePath: string) => {
  shell.showItemInFolder(await resolveAttachmentPath(filePath));
});

handleIpc("getHomeDir", () => {
  return os.homedir();
});

handleIpc("getPinnedConversationIdentifiers", async () => {
  const pinningPath = path.join(os.homedir(), "Library", "Preferences", "com.apple.messages.pinning.plist");
  try {
    const parsed = parseBinaryPlist(await fs.readFile(pinningPath));
    const root = Array.isArray(parsed) ? parsed[0] : null;
    if (!root || typeof root !== "object") {
      return [];
    }
    const pinningData = (root as Record<string, unknown>).pD;
    if (!pinningData || typeof pinningData !== "object") {
      return [];
    }
    const identifiers = (pinningData as Record<string, unknown>).pP;
    if (!Array.isArray(identifiers)) {
      return [];
    }
    return identifiers.filter(
      (identifier): identifier is string => typeof identifier === "string" && identifier.length > 0,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(`Unable to read Messages pinned conversations: ${String(error)}`);
    }
    return [];
  }
});

handleIpc("showEmojiPanel", () => {
  app.showEmojiPanel();
});

handleIpc("showSettings", async () => {
  const { showSettingsWindow } = await import("../window/main-window");
  await showSettingsWindow();
});

handleIpc("setSetupWindowMode", async (active: unknown) => {
  if (typeof active !== "boolean") {
    throw new Error("Invalid setup window state");
  }
  const { setMainWindowSetupMode } = await import("../window/main-window");
  setMainWindowSetupMode(active);
});

const showRendererMenu = <T extends string>(
  event: IpcMainInvokeEvent,
  template: Array<MenuItemConstructorOptions & { value?: T }>,
) =>
  new Promise<T | null>((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const menu = Menu.buildFromTemplate(
      template.map(({ value, ...item }) => ({
        ...item,
        click: value ? () => finish(value) : item.click,
      })),
    );
    menu.popup({
      callback: () => finish(null),
      window: BrowserWindow.fromWebContents(event.sender) || undefined,
    });
  });

type ConversationFilterSelection = "all" | "deleted" | "manage" | "spam" | "unknown" | "unread";

handleIpcWithEvent("showConversationFilterMenu", async (event, currentValue: unknown) => {
  const allowedValues = new Set<ConversationFilterSelection>(["all", "deleted", "spam", "unknown", "unread"]);
  if (typeof currentValue !== "string" || !allowedValues.has(currentValue as ConversationFilterSelection)) {
    throw new Error("Invalid conversation filter");
  }
  const current = currentValue as ConversationFilterSelection;
  return showRendererMenu<ConversationFilterSelection>(event, [
    { checked: current === "all", label: "Messages", type: "checkbox", value: "all" },
    { checked: current === "unknown", label: "Unknown Senders", type: "checkbox", value: "unknown" },
    { checked: current === "spam", label: "Spam", type: "checkbox", value: "spam" },
    { checked: current === "deleted", enabled: false, label: "Recently Deleted", type: "checkbox", value: "deleted" },
    { label: "Filter By", enabled: false },
    { checked: current === "unread", label: "Unread", type: "checkbox", value: "unread" },
    { type: "separator" },
    { label: "Manage Filtering", value: "manage" },
  ]);
});

handleIpcWithEvent("showFaceTimeMenu", (event) =>
  showRendererMenu(event, [
    { enabled: false, label: "FaceTime Audio" },
    { enabled: false, label: "FaceTime Video" },
    { type: "separator" },
    { enabled: false, label: "Share My Screen" },
    { enabled: false, label: "Ask to Share Screen" },
  ]),
);

type ConversationDetailsAction = "export" | "first" | "latest" | "search" | "timestamps";

handleIpcWithEvent("showConversationDetailsEditMenu", (event, showTimes: unknown) => {
  if (typeof showTimes !== "boolean") {
    throw new Error("Invalid timestamp state");
  }
  return showRendererMenu<ConversationDetailsAction>(event, [
    { label: "Search Conversation…", value: "search" },
    { checked: showTimes, label: "Show Timestamps", type: "checkbox", value: "timestamps" },
    { type: "separator" },
    { label: "First Message", value: "first" },
    { label: "Latest Message", value: "latest" },
    { type: "separator" },
    { label: "Export Conversation…", value: "export" },
  ]);
});

handleIpcWithEvent("showMessageAppsMenu", (event) =>
  showRendererMenu(event, [
    { enabled: false, label: "Photos" },
    { enabled: false, label: "Stickers" },
    { enabled: false, label: "Polls" },
    { enabled: false, label: "Send Later" },
    { enabled: false, label: "Genmoji" },
    { enabled: false, label: "Image Playground" },
    { enabled: false, label: "#images" },
    { enabled: false, label: "Message Effects" },
  ]),
);

interface RendererPreferencePatch {
  aiPersonaInstructions?: string;
  openAiKey?: string | null;
  relation?: string;
  useSemanticSearch?: boolean;
}

handleIpcWithEvent("broadcastPreferences", (event, patch: RendererPreferencePatch) => {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Invalid preferences update");
  }
  const keys = Object.keys(patch);
  const allowedKeys = new Set(["aiPersonaInstructions", "openAiKey", "relation", "useSemanticSearch"]);
  if (keys.some((key) => !allowedKeys.has(key))) {
    throw new Error("Unsupported preference");
  }
  if ("openAiKey" in patch && patch.openAiKey !== null && typeof patch.openAiKey !== "string") {
    throw new Error("Invalid OpenAI key");
  }
  if (typeof patch.openAiKey === "string" && patch.openAiKey.length > 500) {
    throw new Error("Invalid OpenAI key");
  }
  if ("relation" in patch && (typeof patch.relation !== "string" || patch.relation.length > 100)) {
    throw new Error("Invalid relationship");
  }
  if (
    "aiPersonaInstructions" in patch &&
    (typeof patch.aiPersonaInstructions !== "string" || patch.aiPersonaInstructions.length > 2_000)
  ) {
    throw new Error("Invalid AI instructions");
  }
  if ("useSemanticSearch" in patch && typeof patch.useSemanticSearch !== "boolean") {
    throw new Error("Invalid semantic-search preference");
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (
      !window.isDestroyed() &&
      window.webContents !== event.sender &&
      isTrustedRendererUrl(window.webContents.getURL())
    ) {
      window.webContents.send("preferencesChanged", patch);
    }
  }
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

    if (
      !chat ||
      !Number.isFinite(chat.chat_id) ||
      !["txt", "json", "csv"].includes(format) ||
      typeof includeAttachments !== "boolean" ||
      typeof fullExport !== "boolean"
    ) {
      throw new Error("Invalid export request");
    }
    const chatIds = getConversationExportIds(chat);
    const handles = chat.handles || [];
    const contactsInChat = handles.flatMap((handle) => {
      const name = handle.contact?.parsedName;
      return name ? [name] : [];
    });

    const requestedName = chat.display_name || contactsInChat.join(", ") || chat.chat_identifier || "messages";
    const name = requestedName.replaceAll(/[/:]/g, "-").slice(0, 200) || "messages";

    const location = await dialog.showSaveDialog({
      defaultPath: `${name}.${format}`,
      filters: [
        { name: "Text", extensions: ["txt"] },
        { name: "JSON", extensions: ["json"] },
        { name: "CSV", extensions: ["csv"] },
      ].filter((l) => l.extensions.includes(format)),
    });
    if (location.canceled) {
      return false;
    }
    const messages = await dbWorker.worker.getMessagesForChatId(chatIds);
    const getAttachments = (message: (typeof messages)[number]) => [message, ...(message.attachmentMessages || [])];

    type HandleType = (typeof handles)[number];
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

    await writeStagedExport(location.filePath!, includeAttachments, async ({ filePath, attachmentsPath }) => {
      const outputStream = fs.createWriteStream(filePath);
      const outputFinished = finished(outputStream);
      try {
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
            const csvSafeMessages = exportedMessages.map((message) =>
              Object.fromEntries(Object.entries(message).map(([key, value]) => [key, escapeSpreadsheetFormula(value)])),
            );
            const csv = await jsonexport(csvSafeMessages);
            outputStream.write(csv);
            break;
        }
        outputStream.end();
        await outputFinished;
      } catch (error) {
        outputStream.destroy();
        await outputFinished.catch(() => undefined);
        throw error;
      }

      if (attachmentsPath) {
        const attachmentsRoot = attachmentsPath;
        for (const [attachmentIndex, message] of messages.flatMap(getAttachments).entries()) {
          const attachmentFilePath = message.filename;
          if (attachmentFilePath) {
            let cleanedPath: string;
            try {
              cleanedPath = await resolveAttachmentPath(attachmentFilePath);
            } catch (error) {
              logger.warn(`Skipping attachment outside the Messages attachment directory: ${String(error)}`);
              continue;
            }
            const attachmentFileName = path.basename(cleanedPath);
            const safeAttachmentName = getSafeAttachmentExportName(
              message.transfer_name || attachmentFileName,
              attachmentFileName,
            );
            const attachmentKey = message.attachment_id ?? attachmentIndex;
            let destinationName = `${message.message_id ?? "message"}-${attachmentKey}-${safeAttachmentName}`;
            if (destinationName.endsWith("pluginPayloadAttachment")) {
              if (message.mime_type) {
                const newSuffix = message.mime_type
                  .split("/")
                  .pop()
                  ?.toLowerCase()
                  .replaceAll(/[^a-z0-9.+-]/g, "");
                if (newSuffix) {
                  destinationName = destinationName.replace(".pluginPayloadAttachment", `.${newSuffix}`);
                }
              } else {
                const fileType = await fileTypeFromFile(cleanedPath);
                if (fileType) {
                  destinationName = destinationName.replace(".pluginPayloadAttachment", `.${fileType.ext}`);
                }
                // we have to infer the file type based on the file
              }
            }
            const destination = path.resolve(attachmentsRoot, destinationName);
            const relativeDestination = path.relative(attachmentsRoot, destination);
            if (
              relativeDestination === ".." ||
              relativeDestination.startsWith(`..${path.sep}`) ||
              path.isAbsolute(relativeDestination)
            ) {
              logger.warn("Skipping attachment with an unsafe export filename");
              continue;
            }
            await copyExportAttachment(cleanedPath, destination);
          }
        }
      }
    });
    return true;
  },
);
