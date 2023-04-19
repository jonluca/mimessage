import { Kysely } from "kysely";
import logger from "../utils/logger";
import type { Database } from "better-sqlite3";
import SqliteDb from "better-sqlite3";
import { SqliteDialect } from "kysely";
import type { KyselyConfig } from "kysely/dist/cjs/kysely";
import { format } from "sql-formatter";

type PostSetupCallback<T> = (db: Database, ks: Kysely<T>) => Promise<void>;
const debugLoggingEnabled = process.env.DEBUG_LOGGING === "true";
export class BaseDatabase<T> {
  path: string;
  name: string;
  postSetup: PostSetupCallback<T> | undefined;
  dbWriter: Kysely<T> | undefined;
  isSettingUpDb = false;

  private initializationPromise!: Promise<void>;

  constructor(name: string, path: string, postSetup?: PostSetupCallback<T>) {
    this.path = path;
    this.name = name;
    this.postSetup = postSetup;
  }

  terminate = () => {
    const db = this.dbWriter;
    this.dbWriter = undefined;
    if (db) {
      return db.destroy();
    }
  };

  isDbInitialized = () => {
    return !!this.dbWriter;
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
      logger.info(`${this.name} initialized`);
    });

    return this.initializationPromise;
  };
  trySetupDb = async () => {
    try {
      if (this.isSettingUpDb) {
        return false;
      }
      this.isSettingUpDb = true;
      logger.info(`Setting up ${this.name}`);
      const sqliteDb = new SqliteDb(this.path, { fileMustExist: false });
      const dialect = new SqliteDialect({ database: sqliteDb });
      const options: KyselyConfig = {
        dialect,
        log(event): void {
          const isError = event.level === "error";

          if (isError || debugLoggingEnabled) {
            const { sql, parameters } = event.query;

            const { queryDurationMillis } = event;
            const duration = queryDurationMillis.toFixed(2);
            const params = (parameters as string[]) || [];
            const formattedSql = format(sql, { params: params.map((l) => String(l)), language: "sqlite" });
            if (event.level === "query") {
              logger.debug(`[Query - ${duration}ms]:\n${formattedSql}\n`);
            }

            if (isError) {
              logger.error(`[SQL Error - ${duration}ms]: ${event.error}\n\n${formattedSql}\n`);
            }
          }
        },
      };

      const db = new Kysely<T>(options);
      if (this.postSetup) {
        await this.postSetup(sqliteDb, db);
      }
      this.dbWriter = db;
      return true;
    } catch (e) {
      logger.error(e);
      return false;
    } finally {
      this.isSettingUpDb = false;
    }
  };

  get db() {
    if (!this.dbWriter) {
      throw new Error(`${this.name} not initialized!`);
    }
    return this.dbWriter;
  }
}

export default BaseDatabase;
