import type { ModuleThread } from "electron-worker-threads";
import { spawn, Thread, Worker } from "electron-worker-threads";
import type { SQLDatabase } from "../data/database";
import { handleIpc } from "../ipc/ipc";
import db from "../data/database";
import { copyLatestDb, localDbExists } from "../data/db-file-utils";
import isDev from "electron-is-dev";
import logger from "../utils/logger";
import type { EmbeddingsDatabase } from "../data/embeddings-database";
import embeddingsDb from "../data/embeddings-database";
import type { ThreadsWorkerOptions } from "electron-worker-threads/dist/types/master";

type WorkerType<T> = {
  [P in keyof T]: T[P] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;
};

class DbWorker {
  worker!: WorkerType<SQLDatabase> | SQLDatabase;
  embeddingsWorker!: WorkerType<EmbeddingsDatabase> | EmbeddingsDatabase;

  startWorker = async () => {
    if (isDev && !process.env.DEV_WORKERS) {
      logger.info("Using main thread for DB");
      this.worker = db;
      this.embeddingsWorker = embeddingsDb;
      return;
    }
    const path = "workers/worker.js";
    const embeddingWorkerPath = "workers/embeddings-worker.js";

    const opts: ThreadsWorkerOptions = {
      resourceLimits: {
        maxOldGenerationSizeMb: 65356,
        maxYoungGenerationSizeMb: 65356,
      },
      asar: true,
    };
    this.worker = await spawn<WorkerType<SQLDatabase>>(new Worker(path, opts));
    this.embeddingsWorker = await spawn<WorkerType<EmbeddingsDatabase>>(new Worker(embeddingWorkerPath, opts));
  };

  stopWorker = () => {
    this.worker?.terminate();
    this.embeddingsWorker?.terminate();
    if (!isDev) {
      if (this.worker) {
        Thread.terminate(this.worker as ModuleThread<WorkerType<SQLDatabase>>);
      }
      if (this.embeddingsWorker) {
        Thread.terminate(this.embeddingsWorker as ModuleThread<WorkerType<EmbeddingsDatabase>>);
      }
    }
  };
  setupHandlers() {
    for (const property in db) {
      const prop = property as keyof WorkerType<SQLDatabase>;
      const dbElement = this.worker[prop];
      if (typeof dbElement === "function") {
        handleIpc(property, dbElement);
      }
    }

    for (const prop in this) {
      const dbElement = this[prop];
      if (typeof dbElement === "function") {
        handleIpc(prop, dbElement as any);
      }
    }

    handleIpc("loadVectorsIntoMemory", this.embeddingsWorker.loadVectorsIntoMemory);
    handleIpc("embeddingsCacheSize", this.embeddingsWorker.embeddingsCacheSize);
  }
  isCopying = false;
  doesLocalDbCopyExist = async () => {
    return !this.isCopying && localDbExists();
  };
  isInitialized = async () => {
    return !this.isCopying && this.worker.isDbInitialized();
  };

  copyLocalDb = async () => {
    logger.info("Initiating local DB copy from DB worker");
    this.isCopying = true;
    await copyLatestDb();
    this.isCopying = false;
    await this.worker.initialize();
    logger.info("Local DB copy complete");
  };
  localDbExists = async () => {
    return localDbExists();
  };
}
const dbWorker = new DbWorker();
export default dbWorker;
