import type { LeveledLogMethod } from "winston";
import fs from "fs";
import winston from "winston";
import { threadId } from "node:worker_threads";
import path from "path";
import os from "os";
import { appPath } from "../versions";
import { createWriteStream } from "fs";
import { MESSAGE } from "triple-beam";
const { combine, timestamp, printf, colorize, errors, splat } = winston.format;
const ts = timestamp({
  format: "YYYY-MM-DD HH:mm:ss",
});
export const print = printf((info) => {
  let message = info.message || info[MESSAGE] || info.code;
  if (typeof message === "object") {
    message = JSON.stringify(message);
  }
  return (
    `[${info.timestamp}] [${info.level}] - ${message}` +
    (info.splat !== undefined ? `${info.splat}` : " ") +
    (info.stack !== undefined ? `${info.stack}` : " ")
  );
});

const localFormat = combine(ts, colorize(), splat(), errors({ stack: true }), print);
export const fileLogFormat = combine(ts, splat(), errors({ stack: true }), print);

const isDev = process.env.NODE_ENV !== "production";
const logDir = path.join(os.homedir(), "Library", "Logs", appPath);
// ensure directory exists recursively
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const workerPrefix = threadId ? `worker-${threadId}-` : "";
export const logPath = path.join(logDir, `${isDev ? "dev-" : ""}${workerPrefix}run-${new Date().toISOString()}.log`);
export const logStream = createWriteStream(logPath);
export const logger = winston.createLogger({
  level: "debug",
  transports: [
    new winston.transports.Console({
      format: localFormat,
    }),
    new winston.transports.Stream({
      stream: logStream,
      format: fileLogFormat,
    }),
  ],
});

const oldError = logger.error;
logger.error = ((...args) => {
  const err = args[0] || {};
  if (!(err instanceof Error)) {
    const stack = new Error().stack;
    if (typeof err === "string") {
      args[0] = { message: err, stack };
    } else {
      err.stack = stack;
    }
  }

  if (!err.message) {
    err.message = "Unknown error";
  }
  args[0] = err;

  return oldError(...args);
}) as LeveledLogMethod;

export default logger;
