import type { LeveledLogMethod } from "winston";
import fs from "fs";
import winston from "winston";
import { threadId } from "node:worker_threads";
import path from "path";
import os from "os";
import { appPath } from "../versions";
import { createWriteStream } from "fs";

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;
const ts = timestamp({
  format: "YYYY-MM-DD HH:mm:ss",
});
export const print = printf((info) => {
  if (typeof info.message === "object") {
    info.message = JSON.stringify(info.message);
  }
  return (
    `[${info.timestamp}] [${info.level}] - ${info.message}` +
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
  if (!(args[0] instanceof Error)) {
    const stack = new Error().stack;
    if (typeof args[0] === "string") {
      args[0] = { message: args[0], stack };
    } else {
      args[0].stack = stack;
    }
  }

  return oldError.apply(logger, args as any);
}) as LeveledLogMethod;

export default logger;
