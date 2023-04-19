import fs, { createWriteStream } from "fs";
import path from "path";
import { threadId } from "node:worker_threads";
import os from "os";
import { appPath } from "./versions";

const isDev = process.env.NODE_ENV !== "production";
const Logs = path.join(os.homedir(), "Library", "Logs", appPath);
// ensure directory exists recursively
if (!fs.existsSync(Logs)) {
  fs.mkdirSync(Logs, { recursive: true });
}
const workerPrefix = threadId ? `worker-${threadId}-` : "";
export const logPath = path.join(Logs, `${isDev ? "dev-" : ""}${workerPrefix}run-${new Date().toISOString()}.log`);
export const logStream = createWriteStream(logPath);
