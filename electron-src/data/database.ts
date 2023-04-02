import SqliteDb from "better-sqlite3";
import { app } from "electron";
import { Kysely, SqliteDialect } from "kysely";
import type { DB as MesssagesDatabase } from "../../_generated/types";
import isDev from "electron-is-dev";
import path from "path";
import logger from "../utils/logger";
import { RESOURCES_PATH } from "../constants";
import type { KyselyConfig } from "kysely/dist/cjs/kysely";
import jetpack from "fs-jetpack";
import { appPath } from "../versions";
import { handleIpc } from "./ipc";
import { groupBy } from "lodash-es";
import type { Contact } from "node-mac-contacts";
import { TypedStreamReader, Unarchiver } from "node-typedstream";
const debugLoggingEnabled = isDev && process.env.DEBUG_LOGGING === "true";
const messagesDb = process.env.HOME + "/Library/Messages/chat.db";
const appMessagesDbCopy = path.join(app.getPath("appData"), appPath, "db.sqlite");

export class SQLDatabase {
  path: string = appMessagesDbCopy;
  private dbWriter: Kysely<MesssagesDatabase> | undefined;

  initializationPromise!: Promise<void>;

  initialize = () => {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = new Promise((resolve) => {
      const success = this.trySetupDb();
      if (!success) {
        const interval = setInterval(() => {
          if (this.trySetupDb()) {
            resolve();
            clearInterval(interval);
          }
        }, 1000);
      } else {
        resolve();
      }
    });
    this.initializationPromise.then(() => {
      logger.info("DB initialized");
    });
    for (const property in db) {
      const prop = property as keyof SQLDatabase;
      const dbElement = db[prop];
      if (typeof dbElement === "function" && !excludedProperties.includes(prop)) {
        handleIpc(property, dbElement);
      }
    }

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
    this.trySetupDb();
  };

  trySetupDb() {
    try {
      const sqliteDb = new SqliteDb(this.path, { readonly: true });
      sqliteDb.loadExtension(path.join(RESOURCES_PATH, "assets/fts4-rank.sqlext"));
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
  }

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
        const read = new TypedStreamReader(chat.attributedBody);
        const unarchiver = new Unarchiver(read);
        const parsed = await unarchiver.decodeAll();
        chat.text = parsed[0]?.value?.string;
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

  getMessagesForChatId = async (chatId: number) => {
    const db = this.db;
    const messages = await db
      .selectFrom("message")
      .selectAll()
      .innerJoin("chat_message_join", "chat_message_join.message_id", "message.ROWID")
      .where("chat_message_join.chat_id", "is", chatId)
      .orderBy("date", "asc")
      .execute();
    for (const message of messages) {
      if (!message.text && message.attributedBody) {
        const read = new TypedStreamReader(message.attributedBody);
        const unarchiver = new Unarchiver(read);
        const parsed = await unarchiver.decodeAll();
        message.text = parsed[0]?.value?.string;
      }
    }
    return messages;
  };
  // private getJoinedFrameStatement = (
  //   selectedApps: string[] | null,
  //   startDate: string | null,
  //   endDate: string | null,
  // ) => {
  //   const db = this.db;
  //
  //   let statement = db
  //     .selectFrom("videoFrame")
  //     .leftJoin("appSegment", "videoFrame.segmentId", "appSegment.id")
  //     .leftJoin("appIcon", "appSegment.appId", "appIcon.appIdentifier")
  //     .leftJoin("videoSegment", "videoFrame.videoId", "videoSegment.id")
  //     .select([
  //       "videoFrame.id",
  //       "videoFrame.segmentId",
  //       "videoFrame.path",
  //       "videoFrame.videoId",
  //       "videoFrame.videoFrameIndex",
  //       "videoFrame.capturedAt as startTime",
  //       "appIcon.appIdentifier",
  //       "videoSegment.filePath",
  //       "appSegment.startTime as appStartTime",
  //       "appSegment.endTime as appEndTime",
  //       "appSegment.browserUrl as url",
  //     ])
  //     .where("videoFrame.segmentId", "is not", null)
  //     .where("appSegment.displayId", "is not", null)
  //     .whereRef("videoFrame.displayId", "=", "appSegment.displayId");
  //
  //   if (selectedApps && selectedApps.length > 0) {
  //     statement = statement.where("appIcon.appIdentifier", "in", selectedApps);
  //   }
  //
  //   if (startDate) {
  //     statement = statement.where("videoFrame.capturedAt", ">=", startDate);
  //   }
  //
  //   if (endDate) {
  //     statement = statement.where("videoFrame.capturedAt", "<=", endDate);
  //   }
  //
  //   return statement;
  // };
  //
  //
  // getDateRange = async (selectedApps: string[] | null = null) => {
  //   const statement = this.getJoinedFrameStatement(selectedApps, null, null).limit(1);
  //   const [min, max] = await Promise.all([
  //     statement.orderBy("videoFrame.capturedAt", "asc").execute(),
  //     statement.orderBy("videoFrame.capturedAt", "desc").execute(),
  //   ]);
  //
  //   return {
  //     min: min[0]?.startTime ? new Date(min[0]?.startTime) : null,
  //     max: max[0]?.startTime ? new Date(max[0]?.startTime) : null,
  //   };
  // };
}

const excludedProperties = ["initialize", "db", "trySetupDb"];

const db = new SQLDatabase();

// monkey patch to handle ipc calls

export const copyLatestDb = async () => {
  if (!(await jetpack.existsAsync(messagesDb))) {
    throw new Error("Messages DB does not exist");
  }
  logger.info("Copying Messages DB");
  await jetpack.copyAsync(messagesDb, appMessagesDbCopy, { overwrite: true });
  logger.info("Messages DB copied");
  await db.initialize();
};

export const localDbExists = async () => {
  return await jetpack.existsAsync(appMessagesDbCopy);
};

export default db;
