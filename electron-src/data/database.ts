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
              logger.debug(`[Query]: ${sql} ${parameters}`);
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
    const recipients = await db.selectFrom("chat").selectAll().execute();
    return recipients;
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
