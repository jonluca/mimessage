import { Kysely } from "kysely";
import logger from "../utils/logger";
import type { Database } from "better-sqlite3";
import SqliteDb from "better-sqlite3";
import { SqliteDialect } from "kysely";
import type { KyselyConfig } from "kysely";
import { format } from "sql-formatter";

type PostSetupCallback<T> = (db: Database, ks: Kysely<T>) => Promise<void>;
interface BaseDatabaseOptions {
  fileMustExist?: boolean;
  maxInitializationAttempts?: number;
  retryDelayMs?: number;
}

class DatabaseInitializationCancelledError extends Error {}

const debugLoggingEnabled = process.env.DEBUG_LOGGING === "true";
export class BaseDatabase<T> {
  path: string;
  name: string;
  postSetup: PostSetupCallback<T> | undefined;
  dbWriter: Kysely<T> | undefined;

  private initializationPromise: Promise<void> | undefined;
  private terminationPromise: Promise<void> | undefined;
  private lifecycleGeneration = 0;
  private readonly fileMustExist: boolean;
  private readonly maxInitializationAttempts: number;
  private readonly retryDelayMs: number;

  constructor(name: string, path: string, postSetup?: PostSetupCallback<T>, options: BaseDatabaseOptions = {}) {
    this.path = path;
    this.name = name;
    this.postSetup = postSetup;
    this.fileMustExist = options.fileMustExist ?? false;
    this.maxInitializationAttempts = options.maxInitializationAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 750;
  }

  terminate = (): Promise<void> => {
    if (this.terminationPromise) {
      return this.terminationPromise;
    }

    this.lifecycleGeneration += 1;
    const pendingInitialization = this.initializationPromise;
    this.initializationPromise = undefined;

    const terminationPromise = (async () => {
      let terminationError: unknown;
      // Signal subclass background work before waiting for initialization. Run
      // it again afterwards in case initialization completed between the two.
      try {
        await this.prepareForTermination();
      } catch (error) {
        terminationError = error;
      }
      await pendingInitialization?.catch(() => undefined);
      try {
        await this.prepareForTermination();
      } catch (error) {
        terminationError ??= error;
      }

      const db = this.dbWriter;
      this.dbWriter = undefined;
      if (db) {
        try {
          await db.destroy();
        } catch (error) {
          terminationError ??= error;
        }
      }
      if (terminationError) {
        throw terminationError;
      }
    })().finally(() => {
      if (this.terminationPromise === terminationPromise) {
        this.terminationPromise = undefined;
      }
    });
    this.terminationPromise = terminationPromise;
    return terminationPromise;
  };

  isDbInitialized = () => {
    return !!this.dbWriter;
  };

  initialize = (): Promise<void> => {
    if (this.dbWriter) {
      return Promise.resolve();
    }
    if (this.terminationPromise) {
      return this.terminationPromise.then(() => this.initialize());
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    const generation = this.lifecycleGeneration;
    const initializationPromise = this.initializeWithRetries(generation)
      .then(() => {
        logger.info(`${this.name} initialized`);
      })
      .finally(() => {
        if (this.initializationPromise === initializationPromise) {
          this.initializationPromise = undefined;
        }
      });
    this.initializationPromise = initializationPromise;
    return initializationPromise;
  };

  private initializeWithRetries = async (generation: number) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxInitializationAttempts; attempt += 1) {
      if (generation !== this.lifecycleGeneration) {
        throw new DatabaseInitializationCancelledError(`${this.name} initialization was cancelled`);
      }

      try {
        await this.trySetupDb(generation);
        return;
      } catch (error) {
        if (error instanceof DatabaseInitializationCancelledError) {
          throw error;
        }
        lastError = error;
        logger.error(`${this.name} initialization attempt ${attempt}/${this.maxInitializationAttempts} failed`);
        logger.error(error);
        if (attempt < this.maxInitializationAttempts) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
      }
    }

    const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
    throw new Error(`${this.name} failed to initialize after ${this.maxInitializationAttempts} attempts${detail}`);
  };

  private trySetupDb = async (generation: number) => {
    let sqliteDb: Database | undefined;
    let db: Kysely<T> | undefined;
    try {
      logger.info(`Setting up ${this.name}`);
      sqliteDb = new SqliteDb(this.path, { fileMustExist: this.fileMustExist });
      const dialect = new SqliteDialect({ database: sqliteDb });
      const options: KyselyConfig = {
        dialect,
        log: !debugLoggingEnabled
          ? ["error"]
          : (event) => {
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

      db = new Kysely<T>(options);
      if (this.postSetup) {
        await this.postSetup(sqliteDb, db);
      }

      if (generation !== this.lifecycleGeneration) {
        throw new DatabaseInitializationCancelledError(`${this.name} initialization was cancelled`);
      }

      this.dbWriter = db;
      this.onInitialized(sqliteDb, db);
      db = undefined;
    } catch (error) {
      if (db) {
        if (this.dbWriter === db) {
          this.dbWriter = undefined;
        }
        try {
          await db.destroy();
        } catch (closeError) {
          logger.error(`Failed to close ${this.name} after an initialization error`);
          logger.error(closeError);
        }
      } else if (sqliteDb?.open) {
        try {
          sqliteDb.close();
        } catch (closeError) {
          logger.error(`Failed to close ${this.name} native handle after an initialization error`);
          logger.error(closeError);
        }
      }
      throw error;
    }
  };

  protected onInitialized(_sqliteDb: Database, _db: Kysely<T>): void {}

  protected async prepareForTermination(): Promise<void> {}

  get db() {
    if (!this.dbWriter) {
      throw new Error(`${this.name} not initialized!`);
    }
    return this.dbWriter;
  }
}

export default BaseDatabase;
