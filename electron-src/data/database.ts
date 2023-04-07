import SqliteDb from "better-sqlite3";
import { app } from "electron";
import { Kysely, sql, SqliteDialect } from "kysely";
import type { DB as MesssagesDatabase } from "../../_generated/types";
import path from "path";
import logger from "../utils/logger";
import { debugLoggingEnabled } from "../constants";
import type { KyselyConfig } from "kysely/dist/cjs/kysely";
import jetpack from "fs-jetpack";
import { appPath } from "../versions";
import { handleIpc } from "./ipc";
import { groupBy } from "lodash-es";
import type { Contact } from "node-mac-contacts";

import { decodeMessageBuffer } from "../utils/buffer";

const messagesDb = process.env.HOME + "/Library/Messages/chat.db";
const appMessagesDbCopy = path.join(app.getPath("appData"), appPath, "db.sqlite");

export class SQLDatabase {
  path: string = appMessagesDbCopy;
  private dbWriter: Kysely<MesssagesDatabase> | undefined;

  initializationPromise!: Promise<void>;

  setupHandlers = () => {
    for (const property in db) {
      const prop = property as keyof SQLDatabase;
      const dbElement = db[prop];
      if (typeof dbElement === "function" && !excludedProperties.includes(prop)) {
        handleIpc(property, dbElement);
      }
    }
  };

  initialize = () => {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = new Promise(async (resolve) => {
      const success = await this.trySetupDb();
      if (!success) {
        const startTimeout = () =>
          setTimeout(async () => {
            const success = await this.trySetupDb();
            if (success) {
              resolve();
            } else {
              startTimeout();
            }
          }, 1000);
        startTimeout();
      } else {
        resolve();
      }
    });
    this.initializationPromise.then(() => {
      logger.info("DB initialized");
    });

    return this.initializationPromise;
  };
  get db() {
    if (!this.dbWriter) {
      throw new Error("DB not initialized!");
    }
    return this.dbWriter;
  }

  reloadDb = async () => {
    if (this.dbWriter) {
      await this.dbWriter.destroy();
    }
    this.dbWriter = undefined;
    await this.trySetupDb();
  };
  isCopying = false;
  doesLocalDbCopyExist = async () => {
    return !this.isCopying && localDbExists();
  };

  copyLocalDb = async () => {
    this.isCopying = true;
    await copyLatestDb();
    this.isCopying = false;
  };

  trySetupDb = async () => {
    try {
      if (!(await localDbExists())) {
        return false;
      }
      const sqliteDb = new SqliteDb(this.path, { readonly: true });
      const dialect = new SqliteDialect({ database: sqliteDb });
      let options: KyselyConfig = {
        dialect,
      };
      if (debugLoggingEnabled) {
        options = {
          ...options,
          log(event): void {
            if (event.level === "query") {
              const { sql, parameters } = event.query;
              const { queryDurationMillis } = event;
              logger.debug(`[Query - ${queryDurationMillis}ms]: ${sql} ${parameters}`);
            }
            if (event.level === "error") {
              logger.debug(`[SQL Error]: ${event.error}`);
            }
          },
        };
      }
      const db = new Kysely<MesssagesDatabase>(options);
      this.dbWriter = db;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  getChatList = async () => {
    const db = this.db;
    const query = db
      .selectFrom("chat as c")
      .select(["c.ROWID as chat_id", "c.guid as chat_guid"])
      .innerJoin("chat_message_join as cmj", "c.ROWID", "cmj.chat_id")
      .innerJoin("message as m", "cmj.message_id", "m.ROWID")
      .selectAll()
      .where((eb) => {
        return eb.cmpr(
          "cmj.message_date",
          "=",
          eb
            .selectFrom("chat_message_join as cmj2")
            .select((e) => e.fn.max("cmj2.message_date").as("max_date"))
            .where("cmj2.chat_id", "=", eb.ref("c.ROWID")),
        );
      })
      .orderBy("m.date", "desc");
    const chats = await query.execute();
    const handles = await db
      .selectFrom("handle")
      .leftJoin("chat_handle_join", "handle.ROWID", "chat_handle_join.handle_id")
      .selectAll()
      .execute();
    type Handles = Array<typeof handles[number] & { contact?: Contact | null }>;
    type EnhancedChat = typeof chats[number] & { handles: Handles };
    const handlesByChatId = groupBy(handles, "chat_id");
    const enhancedChats = chats as EnhancedChat[];
    for (const chat of enhancedChats) {
      const chatHandles = handlesByChatId[chat.chat_id as keyof typeof handlesByChatId] || [];
      chat.handles = chatHandles;
      if (!chat.text && chat.attributedBody) {
        try {
          const parsed = await decodeMessageBuffer(chat.attributedBody);
          if (parsed) {
            chat.text = parsed[0]?.value?.string;
          }
        } catch (e) {
          // ignore buffer errors
        }
      }
    }
    return enhancedChats;
  };

  getLatestMessageForEachChat = async () => {
    const db = this.db;
    const query = db
      .selectFrom("chat as c")
      .select(["c.ROWID as chat_id", "c.guid as chat_guid"])
      .selectAll()
      .innerJoin("chat_message_join as cmj", "c.ROWID", "cmj.chat_id")
      .innerJoin("message as m", "cmj.message_id", "m.ROWID")
      .where((eb) => {
        return eb.cmpr(
          "cmj.message_date",
          "=",
          eb
            .selectFrom("chat_message_join as cmj2")
            .select((e) => e.fn.max("cmj2.message_date").as("max_date"))
            .where("cmj2.chat_id", "=", eb.ref("c.ROWID")),
        );
      })
      .orderBy("m.date", "desc");
    const chats = await query.execute();
    return chats;
  };

  localDbExists = async () => {
    return localDbExists();
  };

  getMessagesForChatId = async (chatId: number) => {
    const db = this.db;
    const messages = await db
      .selectFrom("message")
      .innerJoin("chat_message_join", "chat_message_join.message_id", "message.ROWID")
      .leftJoin("message_attachment_join", "message_attachment_join.message_id", "message.ROWID")
      .leftJoin("attachment", "message_attachment_join.attachment_id", "attachment.ROWID")
      .select([
        "attachment_id",
        "attributedBody",
        "chat_id",
        "date",
        "date_delivered",
        "date_read",
        "group_action_type",
        "group_title",
        "mime_type",
        "other_handle",
        "handle_id",
        "is_from_me",
        "is_read",
        "item_type",
        "filename",
        "error",
        "payload_data",
        "service",
        "text",
        "transfer_name",
        "type",
      ])
      .select(sql<string>`message.ROWID`.as("message_id"))
      .where("chat_message_join.chat_id", "is", chatId)
      .execute();

    type Message = typeof messages[number];
    interface EnhancedMessage extends Message {
      attachmentMessages?: Message[];
      date_obj?: Date;
      date_obj_delivered?: Date;
      date_obj_read?: Date;
    }
    const enhancedMessages = messages as EnhancedMessage[];

    await Promise.all(
      enhancedMessages.map(async (message) => {
        if (message.date) {
          message.date_obj = new Date(message.date / 1000000 + 978307200000);
        }
        if (message.date_delivered) {
          message.date_obj_delivered = new Date(message.date_delivered / 1000000 + 978307200000);
        }
        if (message.date_read) {
          message.date_obj_read = new Date(message.date_read / 1000000 + 978307200000);
        }
        if (message.text) {
          message.text = message.text.replace(/\u{FFFC}|\u{FFFC}/, "");
        }

        if (!message.text && message.attributedBody) {
          const parsed = await decodeMessageBuffer(message.attributedBody);
          if (parsed) {
            message.text = (parsed[0]?.value?.string || "").trim();
          }
        }
      }),
    );
    const groupedMessages = groupBy(enhancedMessages, "message_id");
    const flat = Object.values(groupedMessages).map((messages) => {
      if (messages.length === 1) {
        return messages[0];
      }
      const messageToUse = messages[0];
      messageToUse.attachmentMessages = messages.slice(1);
      return messageToUse;
    });
    flat.sort((a, b) => {
      return (a.date || 0) - (b.date || 0);
    });
    return flat;
  };
}

const excludedProperties = ["initialize", "db", "trySetupDb"];

const db = new SQLDatabase();

// monkey patch to handle ipc calls

export const copyLatestDb = async () => {
  await copyDbAtPath(messagesDb);
};
export const copyDbAtPath = async (path: string) => {
  if (!(await jetpack.existsAsync(path))) {
    throw new Error("Messages DB does not exist");
  }
  logger.info("Copying Messages DB");
  await jetpack.copyAsync(path, appMessagesDbCopy, { overwrite: true });
  logger.info("Messages DB copied");
  await db.initialize();
};

export const localDbExists = async () => {
  return Boolean(await jetpack.existsAsync(appMessagesDbCopy));
};

export default db;
