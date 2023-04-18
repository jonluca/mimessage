import type { LeveledLogMethod } from "winston";
import winston from "winston";
import type { TransformCallback } from "stream";
import { Transform } from "stream";
import { logStream } from "../constants";

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;
const ts = timestamp({
  format: "YYYY-MM-DD HH:mm:ss",
});
const print = printf((info) => {
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

export const logger = winston.createLogger({
  level: "debug",
  format: localFormat,
  transports: [
    new winston.transports.Console({
      format: localFormat,
      level: "debug",
    }),
    new winston.transports.Stream({
      stream: logStream,
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

export class LogStream extends Transform {
  level: string;
  constructor({ level } = { level: "info" }) {
    super({
      readableObjectMode: true,
      writableObjectMode: true,
    });
    this.level = level;
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
    const lines = chunk
      .toString("utf8")
      .split("\n")
      .filter((l: string) => l.trim());
    for (const line of lines) {
      this.push({
        level: this.level,
        message: line,
      });
    }
    callback();
  }
  end(cb?: () => void): this;
  end(chunk: any, cb?: () => void): this;
  end(chunk: any, encoding: BufferEncoding, cb?: () => void): this;
  end(param?: any, encoding?: any, cb?: any): this {
    // dont call super.end or it will close the stream
    cb?.();
    if (typeof param === "function") {
      param();
    }
    if (param) {
      const lines = param
        .toString("utf8")
        .split("\n")
        .filter((l: string) => l.trim());
      for (const line of lines) {
        this.push({
          level: this.level,
          message: line,
        });
      }
      if (typeof encoding === "function") {
        encoding();
      }
      if (typeof cb === "function") {
        cb();
      }
    }
    return this;
  }
}

export default logger;
