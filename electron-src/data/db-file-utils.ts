import SqliteDb from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { access, mkdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import logger from "../utils/logger";
import { appMessagesDbCopy, messagesDb } from "../utils/constants";

export const databaseSidecarPaths = (databasePath: string) => [
  `${databasePath}-journal`,
  `${databasePath}-shm`,
  `${databasePath}-wal`,
];

// Validate the core schema shared by supported Messages databases. Newer
// metadata such as spam flags, replies, and tapback associations is optional.
const REQUIRED_MESSAGES_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  message: ["guid", "date", "text", "attributedBody", "is_from_me"],
  chat: ["guid", "chat_identifier", "display_name"],
  handle: ["id"],
  attachment: ["filename"],
  chat_message_join: ["chat_id", "message_id", "message_date"],
  chat_handle_join: ["chat_id", "handle_id"],
  message_attachment_join: ["message_id", "attachment_id"],
};

export const verifyDbSnapshot = (snapshotPath: string) => {
  const snapshot = new SqliteDb(snapshotPath, { fileMustExist: true, readonly: true });
  try {
    const result = snapshot.pragma("quick_check", { simple: true });
    if (result !== "ok") {
      throw new Error(`Messages database snapshot failed integrity check: ${String(result)}`);
    }
    const tables = snapshot.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as Array<{
      name: string;
    }>;
    const tableNames = new Set(tables.map((table) => table.name.toLowerCase()));
    for (const [table, requiredColumns] of Object.entries(REQUIRED_MESSAGES_COLUMNS)) {
      if (!tableNames.has(table)) {
        throw new Error(`Selected file is not a compatible Messages database: missing ${table} table`);
      }
      const columns = snapshot.pragma(`table_info(${table})`) as Array<{ name: string }>;
      const columnNames = new Set(columns.map((column) => column.name.toLowerCase()));
      const missingColumns = requiredColumns.filter((column) => !columnNames.has(column.toLowerCase()));
      if (missingColumns.length) {
        throw new Error(
          `Selected file is not a compatible Messages database: ${table} is missing ${missingColumns.join(", ")}`,
        );
      }
    }
  } finally {
    snapshot.close();
  }
};

/**
 * Creates a transactionally consistent SQLite snapshot next to the destination.
 * SQLite's online backup API includes committed frames from an active WAL without
 * requiring the Messages app to be closed.
 */
export const stageDbSnapshot = async (sourcePath: string, destinationPath = appMessagesDbCopy) => {
  const destinationDirectory = path.dirname(destinationPath);
  await mkdir(destinationDirectory, { recursive: true });
  const stagedPath = path.join(
    destinationDirectory,
    `.${path.basename(destinationPath)}.staged-${process.pid}-${randomUUID()}`,
  );

  let source: SqliteDb.Database | undefined;
  try {
    const resolvedSourcePath = await realpath(sourcePath);
    source = new SqliteDb(resolvedSourcePath, { fileMustExist: true, readonly: true });
    source.pragma("busy_timeout = 5000");
    logger.info(`Creating SQLite snapshot from ${resolvedSourcePath}`);
    const metadata = await source.backup(stagedPath);
    logger.info(`SQLite snapshot copied ${metadata.totalPages} pages`);
    verifyDbSnapshot(stagedPath);
    logger.info("SQLite snapshot passed integrity and Messages schema checks");
    return stagedPath;
  } catch (error) {
    await rm(stagedPath, { force: true });
    throw error;
  } finally {
    source?.close();
  }
};

/** Installs an already-verified snapshot with a same-directory atomic rename. */
export const installDbSnapshot = async (stagedPath: string, destinationPath = appMessagesDbCopy) => {
  if (path.dirname(stagedPath) !== path.dirname(destinationPath)) {
    throw new Error("Database snapshot must be staged in the destination directory");
  }

  await Promise.all(databaseSidecarPaths(destinationPath).map((sidecarPath) => rm(sidecarPath, { force: true })));
  await rename(stagedPath, destinationPath);
  logger.info("Messages database snapshot installed atomically");
};

export const stageLatestDb = (sourcePath = messagesDb, destinationPath = appMessagesDbCopy) =>
  stageDbSnapshot(sourcePath, destinationPath);

export const discardStagedDb = (stagedPath: string) => rm(stagedPath, { force: true });

/**
 * Compatibility helper for menu-driven imports. The running database keeps its
 * existing file descriptor until the immediate app relaunch, while the next
 * process opens the atomically installed snapshot.
 */
export const copyDbAtPath = async (sourcePath: string, destinationPath = appMessagesDbCopy) => {
  let stagedPath: string | undefined;
  try {
    stagedPath = await stageDbSnapshot(sourcePath, destinationPath);
    await installDbSnapshot(stagedPath, destinationPath);
    stagedPath = undefined;
  } finally {
    if (stagedPath) {
      await discardStagedDb(stagedPath);
    }
  }
};

export const copyLatestDb = (sourcePath = messagesDb, destinationPath = appMessagesDbCopy) =>
  copyDbAtPath(sourcePath, destinationPath);

export const localDbExists = async (databasePath = appMessagesDbCopy) => {
  try {
    await access(databasePath);
    return true;
  } catch {
    return false;
  }
};
