import SqliteDb from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
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

// Hash the pristine backup before adding any MiMessage-owned indexes or metadata.
// Streaming keeps the comparison bounded even for multi-gigabyte Messages libraries.
const recordSnapshotSourceHash = async (snapshotPath: string) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(snapshotPath)) {
    hash.update(chunk);
  }
  const snapshot = new SqliteDb(snapshotPath, { fileMustExist: true });
  try {
    // The staged file must remain self-contained until its atomic rename.
    snapshot.pragma("journal_mode = DELETE");
    snapshot.transaction(() => {
      snapshot.exec(`
        DROP TABLE IF EXISTS mimessage_snapshot_source;
        CREATE TABLE mimessage_snapshot_source (sha256 TEXT NOT NULL);
      `);
      snapshot.prepare("INSERT INTO mimessage_snapshot_source (sha256) VALUES (?)").run(hash.digest("hex"));
    })();
  } finally {
    snapshot.close();
  }
};

const readSnapshotSourceHash = (snapshotPath: string) => {
  const snapshot = new SqliteDb(snapshotPath, { fileMustExist: true, readonly: true });
  try {
    const exists = snapshot
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'mimessage_snapshot_source'")
      .get();
    if (!exists) {
      return undefined;
    }
    return snapshot.prepare<[], { sha256: string }>("SELECT sha256 FROM mimessage_snapshot_source").get()?.sha256;
  } finally {
    snapshot.close();
  }
};

export const isUnchangedDbSnapshot = async (stagedPath: string, destinationPath = appMessagesDbCopy) => {
  if (!(await localDbExists(destinationPath))) {
    return false;
  }
  let previousHash: string | undefined;
  try {
    previousHash = readSnapshotSourceHash(destinationPath);
  } catch (error) {
    // A valid new snapshot must still be able to replace an unreadable local copy.
    logger.warn(`Unable to compare the existing Messages snapshot; replacing it: ${String(error)}`);
    return false;
  }
  return Boolean(previousHash && previousHash === readSnapshotSourceHash(stagedPath));
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
    await recordSnapshotSourceHash(stagedPath);
    logger.info("SQLite snapshot passed integrity and Messages schema checks");
    return stagedPath;
  } catch (error) {
    await discardStagedDb(stagedPath);
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

export const discardStagedDb = async (stagedPath: string) => {
  await Promise.all([stagedPath, ...databaseSidecarPaths(stagedPath)].map((filePath) => rm(filePath, { force: true })));
};

/**
 * Copies a snapshot when no database worker has the destination open.
 */
export const copyDbAtPath = async (sourcePath: string, destinationPath = appMessagesDbCopy) => {
  let stagedPath: string | undefined;
  try {
    stagedPath = await stageDbSnapshot(sourcePath, destinationPath);
    if (await isUnchangedDbSnapshot(stagedPath, destinationPath)) {
      return;
    }
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
