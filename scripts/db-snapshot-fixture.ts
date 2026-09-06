import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import SqliteDb from "better-sqlite3";
import {
  copyDbAtPath,
  discardStagedDb,
  isUnchangedDbSnapshot,
  stageDbSnapshot,
  verifyDbSnapshot,
} from "../electron-src/data/db-file-utils";
import { MessageTextIndex } from "../electron-src/data/text-index";

const createMessagesFixture = (databasePath: string) => {
  const database = new SqliteDb(databasePath);
  // Keep modern reply, tapback, spam, and filtering metadata absent so the
  // import validator does not accidentally require optional schema extensions.
  database.exec(`
    CREATE TABLE message (guid TEXT, date INTEGER, text TEXT, attributedBody BLOB, is_from_me INTEGER);
    CREATE TABLE chat (guid TEXT, chat_identifier TEXT, display_name TEXT);
    CREATE TABLE handle (id TEXT);
    CREATE TABLE attachment (filename TEXT);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER, message_date INTEGER);
    CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
    CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
  `);
  return database;
};

const run = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mimessage-snapshot-fixture-"));
  const destinationPath = path.join(directory, "existing-messages.db");
  let validSource: SqliteDb.Database | undefined;
  try {
    const destination = createMessagesFixture(destinationPath);
    destination.exec("INSERT INTO message (guid, text) VALUES ('existing', 'preserved original')");
    destination.close();
    const existingBytes = await fs.readFile(destinationPath);

    const unrelatedPath = path.join(directory, "unrelated.db");
    const unrelated = new SqliteDb(unrelatedPath);
    unrelated.exec("CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES ('not a message database')");
    unrelated.close();
    await assert.rejects(copyDbAtPath(unrelatedPath, destinationPath), /not a compatible Messages database/);
    assert.deepEqual(await fs.readFile(destinationPath), existingBytes, "a rejected import must preserve the copy");

    const incompletePath = path.join(directory, "incomplete.db");
    const incomplete = createMessagesFixture(incompletePath);
    incomplete.exec("ALTER TABLE chat_message_join DROP COLUMN message_id");
    incomplete.close();
    await assert.rejects(stageDbSnapshot(incompletePath, destinationPath), /chat_message_join is missing message_id/);
    assert.deepEqual(await fs.readFile(destinationPath), existingBytes);
    assert.equal(
      (await fs.readdir(directory)).some((filename) => filename.includes(".staged-")),
      false,
      "rejected snapshots must be removed",
    );

    const validPath = path.join(directory, "valid-messages.db");
    validSource = createMessagesFixture(validPath);
    validSource.pragma("journal_mode = WAL");
    validSource.pragma("wal_autocheckpoint = 0");
    validSource.exec(`
      INSERT INTO message (guid, text, is_from_me) VALUES ('wal-message', 'committed in WAL', 1);
      INSERT INTO chat (ROWID, guid, chat_identifier) VALUES (1, 'chat-one', 'fixture');
      INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1);
    `);
    assert.ok((await fs.stat(`${validPath}-wal`)).size > 0);
    await copyDbAtPath(validPath, destinationPath);
    verifyDbSnapshot(destinationPath);
    const installed = new SqliteDb(destinationPath);
    let indexStatus;
    try {
      assert.deepEqual(installed.prepare("SELECT guid, text FROM message").all(), [
        { guid: "wal-message", text: "committed in WAL" },
      ]);
      assert.equal(
        installed.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM chat_message_join").get()?.count,
        1,
      );
      const textIndex = new MessageTextIndex(installed);
      await textIndex.start();
      indexStatus = textIndex.getStatus();
      assert.ok(indexStatus?.complete);
      await textIndex.stop();
    } finally {
      installed.close();
    }
    assert.equal(validSource.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM message").get()?.count, 1);
    const indexedBytes = await fs.readFile(destinationPath);
    const unchangedStage = await stageDbSnapshot(validPath, destinationPath);
    try {
      assert.equal(await isUnchangedDbSnapshot(unchangedStage, destinationPath), true);
    } finally {
      await discardStagedDb(unchangedStage);
    }
    await copyDbAtPath(validPath, destinationPath);
    assert.deepEqual(
      await fs.readFile(destinationPath),
      indexedBytes,
      "unchanged refresh preserves every installed byte",
    );
    const reopened = new SqliteDb(destinationPath);
    try {
      const reopenedIndex = new MessageTextIndex(reopened);
      await reopenedIndex.start();
      assert.deepEqual(reopenedIndex.getStatus(), indexStatus, "restart preserves the semantic snapshot identity");
      await reopenedIndex.stop();
    } finally {
      reopened.close();
    }

    validSource.pragma("wal_checkpoint(TRUNCATE)");
    const checkpointedStage = await stageDbSnapshot(validPath, destinationPath);
    try {
      assert.equal(
        await isUnchangedDbSnapshot(checkpointedStage, destinationPath),
        true,
        "checkpointing unchanged source data must preserve its snapshot identity",
      );
    } finally {
      await discardStagedDb(checkpointedStage);
    }

    // Counts and max ROWID alone cannot detect edits or replacement databases.
    validSource.exec("UPDATE message SET text = 'edited in WAL' WHERE guid = 'wal-message'");
    const changedStage = await stageDbSnapshot(validPath, destinationPath);
    try {
      assert.equal(await isUnchangedDbSnapshot(changedStage, destinationPath), false);
    } finally {
      await discardStagedDb(changedStage);
    }
    await copyDbAtPath(validPath, destinationPath);
    const updated = new SqliteDb(destinationPath, { readonly: true });
    try {
      assert.equal(updated.prepare<[], { text: string }>("SELECT text FROM message").get()?.text, "edited in WAL");
      assert.equal(
        updated.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'mimessage_text_index_state'").get(),
        undefined,
        "changed source cannot inherit the previous projection or semantic identity",
      );
    } finally {
      updated.close();
    }

    const damagedPath = path.join(directory, "damaged-local-copy.db");
    await fs.writeFile(damagedPath, "damaged local copy");
    await copyDbAtPath(validPath, damagedPath);
    verifyDbSnapshot(damagedPath);
    const repaired = new SqliteDb(damagedPath, { readonly: true });
    try {
      assert.equal(
        repaired.prepare<[], { text: string }>("SELECT text FROM message").get()?.text,
        "edited in WAL",
        "an unreadable installed snapshot cannot prevent a verified replacement from repairing it",
      );
    } finally {
      repaired.close();
    }
    assert.equal(
      (await fs.readdir(directory)).some((filename) => filename.includes(".staged-")),
      false,
    );
    console.log(
      "Database snapshot fixture passed: rejected imports preserve data, WAL import/checkpoint, unchanged index reuse, edits, and damaged-copy recovery",
    );
  } finally {
    validSource?.close();
    await fs.rm(directory, { force: true, recursive: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
