import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import SqliteDb from "better-sqlite3";
import { SQLDatabase } from "../electron-src/data/database";

const run = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mimessage-page-fixture-"));
  const databasePath = path.join(directory, "messages.sqlite");
  const fixture = new SqliteDb(databasePath);
  fixture.exec(`
    CREATE TABLE message (
      guid TEXT NOT NULL,
      attributedBody BLOB,
      balloon_bundle_id TEXT,
      date INTEGER,
      date_delivered INTEGER,
      date_read INTEGER,
      group_action_type INTEGER DEFAULT 0,
      group_title TEXT,
      other_handle INTEGER DEFAULT 0,
      handle_id INTEGER,
      is_from_me INTEGER DEFAULT 0,
      is_delivered INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 1,
      is_spam INTEGER DEFAULT 0,
      item_type INTEGER DEFAULT 0,
      error INTEGER DEFAULT 0,
      payload_data BLOB,
      share_direction INTEGER,
      service TEXT,
      text TEXT,
      thread_originator_guid TEXT,
      thread_originator_part TEXT,
      type INTEGER DEFAULT 0,
      associated_message_type INTEGER DEFAULT 0
    );
    CREATE TABLE chat_message_join (
      chat_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      message_date INTEGER,
      PRIMARY KEY (chat_id, message_id)
    );
    CREATE TABLE message_attachment_join (
      message_id INTEGER NOT NULL,
      attachment_id INTEGER NOT NULL,
      PRIMARY KEY (message_id, attachment_id)
    );
    CREATE TABLE attachment (
      mime_type TEXT,
      filename TEXT,
      transfer_name TEXT
    );
    CREATE TABLE chat (
      guid TEXT,
      chat_identifier TEXT,
      display_name TEXT,
      is_blackholed INTEGER DEFAULT 0,
      is_filtered INTEGER DEFAULT 0,
      last_read_message_timestamp INTEGER
    );
    CREATE TABLE handle (id TEXT);
    CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
    INSERT INTO chat (ROWID, guid, display_name) VALUES
      (1, 'chat-1', 'One'), (2, 'chat-2', 'Two'), (3, 'chat-3', 'Three'), (4, 'chat-4', 'Bulk'),
      (5, 'chat-5', 'Tied dates'), (6, 'chat-6', 'Empty'), (7, 'chat-7', 'Undated');
    INSERT INTO handle (ROWID, id) VALUES (10, 'first@example.com'), (11, 'second@example.com');
    INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 10), (2, 10), (2, 11);

    INSERT INTO message (ROWID, guid, date, handle_id, text, service) VALUES
      (1, 'guid-1', NULL, 10, 'zero start', 'iMessage'),
      (2, 'guid-2', 100, 10, 'Alpha first', 'iMessage'),
      (3, 'guid-3', 100, 10, 'beta with files', 'iMessage'),
      (4, 'guid-4', 200, 10, 'gamma shared chat', 'iMessage'),
      (5, 'guid-5', 300, 11, 'ALPHA newest', 'iMessage'),
      (6, 'guid-6', 400, 12, 'outside', 'iMessage'),
      (7, 'guid-7', 500, 12, 'earlier tied message', 'iMessage'),
      (8, 'guid-8', 500, 12, 'latest tied message', 'iMessage'),
      (9, 'guid-9', NULL, 12, 'undated message', 'iMessage');
    UPDATE message SET attributedBody = X'1234', payload_data = X'ABCD' WHERE ROWID IN (2, 3);
    UPDATE message SET thread_originator_guid = 'guid-2', thread_originator_part = '0:0:0' WHERE ROWID = 5;
    INSERT INTO chat_message_join (chat_id, message_id, message_date) VALUES
      (1, 1, NULL), (1, 2, 100), (1, 3, 100), (1, 4, 200),
      (2, 4, 200), (2, 5, 300), (3, 6, 400), (5, 7, 500), (5, 8, 500), (7, 9, NULL);
    INSERT INTO attachment (ROWID, mime_type, filename, transfer_name) VALUES
      (21, 'image/png', '/tmp/a.png', 'a.png'),
      (22, 'image/jpeg', '/tmp/b.jpg', 'b.jpg'),
      (23, 'image/png', '/tmp/c.png', 'c.png');
    INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (3, 21), (3, 22), (4, 23);

    WITH RECURSIVE ids(id) AS (
      SELECT 1000
      UNION ALL
      SELECT id + 1 FROM ids WHERE id < 1204
    )
    INSERT INTO message (ROWID, guid, date, handle_id, text, service)
    SELECT id, 'bulk-' || id, id * 1000, 20, 'bulk fixture', 'iMessage' FROM ids;
    INSERT INTO chat_message_join (chat_id, message_id, message_date)
    SELECT 4, ROWID, date FROM message WHERE ROWID BETWEEN 1000 AND 1204;
  `);
  fixture.close();

  const database = new SQLDatabase("Message page fixture", databasePath);
  try {
    await database.initialize();

    const chats = await database.getChatList();
    assert.deepEqual(
      chats.map((chat) => chat.chat_id),
      [4, 5, 3, 2, 1, 7],
      "chat previews must include each nonempty chat once, ordered by its latest message",
    );
    assert.equal(chats.find((chat) => chat.chat_id === 5)?.text, "latest tied message");
    assert.equal(chats.find((chat) => chat.chat_id === 7)?.text, "undated message");
    assert.deepEqual(
      chats.find((chat) => chat.chat_id === 2)?.handles.map((handle) => handle.id),
      ["first@example.com", "second@example.com"],
    );

    const latest = await database.getMessagesPage([1, 2], { limit: 2 });
    assert.deepEqual(
      latest.messages.map((message) => message.message_id),
      [4, 5],
    );
    assert.equal(latest.hasOlder, true);
    assert.equal(latest.hasNewer, false);
    assert.equal(latest.olderCursor?.date, "200");
    assert.equal(latest.oldestPredecessor?.message_id, 3);
    assert.equal(latest.newestSuccessor, null);
    assert.equal(latest.messages.filter((message) => message.message_id === 4).length, 1);
    assert.equal(latest.messages[0].attachmentMessages, undefined);
    assert.deepEqual(latest.messages[1].reply_origin, {
      attachmentLabel: null,
      guid: "guid-2",
      handle_id: 10,
      is_from_me: false,
      message_id: 2,
      text: "Alpha first",
    });

    const older = await database.getMessagesPage([1, 2], {
      cursor: latest.olderCursor,
      direction: "older",
      limit: 2,
    });
    assert.deepEqual(
      older.messages.map((message) => message.message_id),
      [2, 3],
    );
    assert.equal(older.hasOlder, true);
    assert.equal(older.hasNewer, true);
    assert.equal(older.oldestPredecessor?.message_id, 1);
    assert.equal(older.newestSuccessor?.message_id, 4);
    assert.equal(older.messages[1].attachmentMessages?.length, 1);
    assert.equal("attributedBody" in older.messages[0], false);
    assert.equal("payload_data" in older.messages[0], false);
    assert.equal("attributedBody" in older.messages[1].attachmentMessages![0], false);
    assert.equal("payload_data" in older.messages[1].attachmentMessages![0], false);

    const attachmentBoundary = await database.getMessagesPage(1, { anchorMessageId: 3, limit: 1 });
    assert.deepEqual(
      attachmentBoundary.messages.map((message) => message.message_id),
      [3],
    );
    assert.equal(attachmentBoundary.messages[0].attachmentMessages?.length, 1);

    const oldest = await database.getMessagesPage([1, 2], { position: "oldest", limit: 2 });
    assert.deepEqual(
      oldest.messages.map((message) => message.message_id),
      [1, 2],
    );
    assert.equal(oldest.hasOlder, false);
    assert.equal(oldest.hasNewer, true);
    assert.equal(oldest.oldestPredecessor, null);
    assert.equal(oldest.newestSuccessor?.message_id, 3);

    const nullDateBoundary = await database.getMessagesPage([1, 2], { position: "oldest", limit: 1 });
    assert.equal(nullDateBoundary.newerCursor?.date, "-9223372036854775808");
    const afterNullDate = await database.getMessagesPage([1, 2], {
      cursor: nullDateBoundary.newerCursor,
      direction: "newer",
      limit: 1,
    });
    assert.deepEqual(
      afterNullDate.messages.map((message) => message.message_id),
      [2],
    );

    const acrossTiedDate = await database.getMessagesPage([1, 2], {
      cursor: afterNullDate.newerCursor,
      direction: "newer",
      limit: 1,
    });
    assert.deepEqual(
      acrossTiedDate.messages.map((message) => message.message_id),
      [3],
    );

    const newer = await database.getMessagesPage([1, 2], {
      cursor: older.newerCursor,
      direction: "newer",
      limit: 2,
    });
    assert.deepEqual(
      newer.messages.map((message) => message.message_id),
      [4, 5],
    );

    const anchored = await database.getMessagesPage([1, 2], { anchorMessageId: 3, limit: 3 });
    assert.deepEqual(
      anchored.messages.map((message) => message.message_id),
      [2, 3, 4],
    );
    assert.equal(anchored.hasOlder, true);
    assert.equal(anchored.hasNewer, true);
    assert.equal(anchored.oldestPredecessor?.message_id, 1);
    assert.equal(anchored.newestSuccessor?.message_id, 5);

    const clamped = await database.getMessagesPage(4, { limit: 10_000 });
    assert.equal(clamped.messages.length, 200);
    await assert.rejects(database.getMessagesPage(1, { limit: 0 }), /Invalid result limit/);
    await assert.rejects(
      database.getMessagesPage(1, { cursor: { date: "not-a-date", messageId: 2 } }),
      /Invalid message page cursor/,
    );
    await assert.rejects(database.getMessagesPage(1, { anchorMessageId: -1 }), /Invalid anchor message ID/);

    const literal = await database.searchMessagesForChatId([1, 2], "alpha", false, 10);
    assert.deepEqual(
      literal.map((message) => message.message_id),
      [2, 5],
    );
    assert.equal("attributedBody" in literal[0], false);
    assert.equal("payload_data" in literal[0], false);

    const regex = await database.searchMessagesForChatId(1, "^(alpha|beta)", true, 10);
    assert.deepEqual(
      regex.map((message) => message.message_id),
      [2, 3],
    );
    await assert.rejects(database.searchMessagesForChatId(1, "[", true, 10), /Invalid regular expression/);
  } finally {
    await database.terminate();
    await fs.rm(directory, { recursive: true, force: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
