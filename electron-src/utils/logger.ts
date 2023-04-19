import type { LeveledLogMethod } from "winston";
import winston from "winston";

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
