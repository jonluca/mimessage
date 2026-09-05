import type { ModuleThread, ThreadsWorkerOptions } from "electron-worker-threads";
import { spawn, Thread, Worker } from "electron-worker-threads";
import SqliteDb from "better-sqlite3";
import type { SQLDatabase } from "../data/database";
import { invalidateMessageTextIndex } from "../data/text-index";
import { handleIpc } from "../ipc/ipc";
import db from "../data/database";
import { discardStagedDb, installDbSnapshot, localDbExists, stageDbSnapshot } from "../data/db-file-utils";
import isDev from "electron-is-dev";
import logger from "../utils/logger";
import type { EmbeddingsDatabase } from "../data/embeddings-database";
import embeddingsDb from "../data/embeddings-database";
import { appMessagesDbCopy, messagesDb } from "../utils/constants";

type WorkerType<T> = {
  [P in keyof T]: T[P] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;
};

const DATABASE_IPC_METHODS = [
  "initialize",
  "getChatList",
  "getEarliestMessageDate",
  "getMessagesForChatId",
  "getMessagesPage",
  "searchMessagesForChatId",
  "calculateWrappedStats",
  "calculateSlowWrappedStats",
] as const satisfies ReadonlyArray<keyof WorkerType<SQLDatabase>>;

class DbWorker {
  worker!: WorkerType<SQLDatabase> | SQLDatabase;
  embeddingsWorker!: WorkerType<EmbeddingsDatabase> | EmbeddingsDatabase;
  private usesThreadWorkers = false;
  private copyPromise: Promise<void> | undefined;

  private spawnDatabaseWorker = () => {
    const opts: ThreadsWorkerOptions = { asar: true };
    return spawn<WorkerType<SQLDatabase>>(new Worker("workers/worker.js", opts));
  };

  private spawnEmbeddingsWorker = () => {
    const opts: ThreadsWorkerOptions = { asar: true };
    return spawn<WorkerType<EmbeddingsDatabase>>(new Worker("workers/embeddings-worker.js", opts));
  };

  startWorker = async () => {
    if (isDev && !process.env.DEV_WORKERS) {
      this.usesThreadWorkers = false;
      logger.info("Using main thread for DB");
      this.worker = db;
      this.embeddingsWorker = embeddingsDb;
      return;
    }
    this.usesThreadWorkers = true;
    [this.worker, this.embeddingsWorker] = await Promise.all([
      this.spawnDatabaseWorker(),
      this.spawnEmbeddingsWorker(),
    ]);
  };

  stopWorker = async () => {
    const databaseWorker = this.worker;
    const embeddingsWorker = this.embeddingsWorker;
    await Promise.allSettled([databaseWorker?.terminate(), embeddingsWorker?.terminate()]);
    if (this.usesThreadWorkers) {
      await Promise.allSettled([
        databaseWorker ? Thread.terminate(databaseWorker as ModuleThread<WorkerType<SQLDatabase>>) : Promise.resolve(),
        embeddingsWorker
          ? Thread.terminate(embeddingsWorker as ModuleThread<WorkerType<EmbeddingsDatabase>>)
          : Promise.resolve(),
      ]);
    }
  };

  private stopDatabaseForRefresh = async () => {
    const databaseWorker = this.worker;
    let gracefulTerminationError: unknown;
    try {
      await databaseWorker.terminate();
    } catch (error) {
      gracefulTerminationError = error;
    }
    if (this.usesThreadWorkers) {
      try {
        await Thread.terminate(databaseWorker as ModuleThread<WorkerType<SQLDatabase>>);
      } catch (error) {
        throw new AggregateError(
          [gracefulTerminationError, error].filter((value) => value !== undefined),
          "Failed to terminate the Messages database worker before refresh",
        );
      }
      if (gracefulTerminationError) {
        logger.error("Messages database cleanup reported an error; the worker thread was force-terminated");
        logger.error(
          gracefulTerminationError instanceof Error ? gracefulTerminationError : String(gracefulTerminationError),
        );
      }
      return;
    }
    if (gracefulTerminationError) {
      throw gracefulTerminationError;
    }
  };

  private startDatabaseAfterRefresh = async () => {
    const nextWorker = this.usesThreadWorkers ? await this.spawnDatabaseWorker() : db;
    try {
      await nextWorker.initialize();
    } catch (error) {
      if (this.usesThreadWorkers) {
        try {
          await Thread.terminate(nextWorker as ModuleThread<WorkerType<SQLDatabase>>);
        } catch (terminationError) {
          throw new AggregateError(
            [error, terminationError],
            "Messages database initialization failed and its worker could not be terminated",
          );
        }
      }
      throw error;
    }
    this.worker = nextWorker;
  };

  private invalidateInstalledTextIndex = () => {
    const installedDatabase = new SqliteDb(appMessagesDbCopy, { fileMustExist: true });
    try {
      invalidateMessageTextIndex(installedDatabase);
    } finally {
      installedDatabase.close();
    }
  };

  setupHandlers() {
    for (const method of DATABASE_IPC_METHODS) {
      handleIpc(method, (...args: unknown[]) => {
        const handler = this.worker[method] as (...handlerArgs: unknown[]) => unknown;
        return handler(...args);
      });
    }

    handleIpc("doesLocalDbCopyExist", this.doesLocalDbCopyExist);
    handleIpc("isInitialized", this.isInitialized);
    handleIpc("copyLocalDb", this.copyLocalDb);
    handleIpc("embeddingsCacheSize", this.embeddingsWorker.embeddingsCacheSize);
  }
  isCopying = false;
  doesLocalDbCopyExist = async () => {
    return !this.isCopying && localDbExists();
  };
  isInitialized = async () => {
    return !this.isCopying && this.worker.isDbInitialized();
  };

  private performLocalDbCopy = async (sourcePath: string) => {
    let stagedPath: string | undefined;
    let databaseStopped = false;
    this.isCopying = true;
    logger.info("Initiating WAL-safe local DB snapshot");
    try {
      stagedPath = await stageDbSnapshot(sourcePath);
      await this.stopDatabaseForRefresh();
      databaseStopped = true;
      await installDbSnapshot(stagedPath);
      stagedPath = undefined;
      this.invalidateInstalledTextIndex();
      await this.startDatabaseAfterRefresh();
      databaseStopped = false;
      logger.info("Local DB snapshot installed and database reopened");
    } finally {
      if (stagedPath) {
        await discardStagedDb(stagedPath);
      }
      if (databaseStopped) {
        try {
          await this.startDatabaseAfterRefresh();
        } catch (error) {
          logger.error(`Failed to reopen Messages database after refresh: ${String(error)}`);
        }
      }
      this.isCopying = false;
    }
  };

  copyLocalDbFromPath = (sourcePath = messagesDb) => {
    this.copyPromise ??= this.performLocalDbCopy(sourcePath).finally(() => {
      this.copyPromise = undefined;
    });
    return this.copyPromise;
  };
  copyLocalDb = () => this.copyLocalDbFromPath();
  localDbExists = async () => {
    return localDbExists();
  };
}
const dbWorker = new DbWorker();
export default dbWorker;
