import type { SQLDatabase } from "./database";
import { handleIpc } from "./ipc";
import db from "./database";
import { copyLatestDb, localDbExists } from "./db-file-utils";
type WorkerType<T> = {
  [P in keyof T]: T[P] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;
};

class DbWorker {
  worker!: WorkerType<SQLDatabase> | SQLDatabase;

  startWorker = async () => {
    // const path = isDev ? "data/worker.js" : join("..", "..", "..", "assets", "worker.js");

    // fix this for now due to prod breakage
    this.worker = db;

    // this.worker = isDev
    //   ? db
    //   : await spawn<WorkerType<SQLDatabase>>(
    //       new Worker(path, {
    //         resourceLimits: { maxOldGenerationSizeMb: 16384, maxYoungGenerationSizeMb: 16384 },
    //       }),
    //     );
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

  copyLocalDb = async () => {
    this.isCopying = true;
    await copyLatestDb();
    this.isCopying = false;
    await this.worker.reloadDb();
  };
  localDbExists = async () => {
    return localDbExists();
  };
}
const dbWorker = new DbWorker();
export default dbWorker;
