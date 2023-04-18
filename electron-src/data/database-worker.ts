import { spawn, Worker } from "threads";
import type { SQLDatabase } from "./database";
import { handleIpc } from "./ipc";
import db from "./database";
import { copyLatestDb, localDbExists } from "./db-file-utils";
import isDev from "electron-is-dev";
import { join } from "path";
import logger from "../utils/logger";
type WorkerType<T> = {
  [P in keyof T]: T[P] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;
};

class DbWorker {
  worker!: WorkerType<SQLDatabase> | SQLDatabase;

  startWorker = async () => {
    const path = isDev ? "data/worker.js" : join("..", "..", "..", "app.asar.unpacked", "worker.js");

    this.worker = isDev
      ? db
      : await spawn<WorkerType<SQLDatabase>>(
          new Worker(path, {
            resourceLimits: { maxOldGenerationSizeMb: 32678, maxYoungGenerationSizeMb: 32678 },
          }),
        );
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
