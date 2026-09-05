import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import SqliteDb from "better-sqlite3";
import { SQLDatabase } from "../electron-src/data/database";
import { searchRegexRowsInWorker } from "../electron-src/data/regex-worker-search";
import {
  getLocalMessageIndex,
  getPrependedMessageCount,
  getTranscriptItemKey,
  mergeMessagePages,
  MESSAGE_VIRTUAL_INDEX_BASE,
} from "../src/utils/message-pagination";

type MessageResult = Awaited<ReturnType<SQLDatabase["getMessagesPage"]>>["messages"][number];

const messageIds = (messages: MessageResult[]) => messages.map((message) => message.message_id);
const groupingContext = (message: MessageResult) => ({
  date: message.date,
  handle_id: message.handle_id,
  is_from_me: message.is_from_me,
  item_type: message.item_type,
  message_id: message.message_id,
  service: message.service,
});

const assertTransportSafe = (messages: MessageResult[]) => {
  const inspect = (value: unknown) => {
    assert.equal(typeof value, "object");
    assert.notEqual(value, null);
    const message = value as Record<string, unknown>;
    assert.equal(Object.hasOwn(message, "attributedBody"), false);
    assert.equal(Object.hasOwn(message, "payload_data"), false);
    if (Array.isArray(message.attachmentMessages)) {
      message.attachmentMessages.forEach(inspect);
    }
  };

  messages.forEach(inspect);
};

const verifyRegexWorker = async () => {
  const arbitraryRegexMatches = await searchRegexRowsInWorker(
    String.raw`(?<=prefix )(?<word>alpha|beta|gamma)\s+\k<word>$`,
    [
      { messageGuid: "first", text: "prefix alpha ALPHA" },
      { messageGuid: "first", text: "prefix alpha alpha" },
      { messageGuid: "second", text: "prefix beta beta" },
      { messageGuid: "third", text: "prefix gamma gamma" },
    ][Symbol.iterator](),
    2,
    { batchSize: 1, batchTimeoutMs: 1_000, totalTimeoutMs: 5_000 },
  );
  assert.deepEqual(arbitraryRegexMatches, ["first", "second"]);

  let heartbeatFired = false;
  const pathologicalSearch = assert.rejects(
    searchRegexRowsInWorker(
      String.raw`^(a+)+$`,
      [{ messageGuid: "pathological", text: `${"a".repeat(100_000)}!` }][Symbol.iterator](),
      1,
      { batchSize: 1, batchTimeoutMs: 100, totalTimeoutMs: 2_000 },
    ),
    /timed out/,
  );
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      heartbeatFired = true;
      resolve();
    }, 25);
  });
  assert.equal(heartbeatFired, true, "regex evaluation must not block its caller's event loop");
  await pathologicalSearch;

  const controller = new AbortController();
  const cancelledSearch = assert.rejects(
    searchRegexRowsInWorker(
      String.raw`^(a+)+$`,
      [{ messageGuid: "cancelled", text: `${"a".repeat(100_000)}!` }][Symbol.iterator](),
      1,
      { batchTimeoutMs: 1_000, signal: controller.signal, totalTimeoutMs: 5_000 },
    ),
    /cancelled/,
  );
  setTimeout(() => controller.abort(), 25);
  await cancelledSearch;

  const recoveryMatches = await searchRegexRowsInWorker(
    "recovered$",
    [{ messageGuid: "recovered", text: "worker recovered" }][Symbol.iterator](),
    1,
  );
  assert.deepEqual(recoveryMatches, ["recovered"]);
};

const run = async () => {
  await verifyRegexWorker();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mimessage-pagination-fixture-"));
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

    INSERT INTO message (
      ROWID,
      guid,
      attributedBody,
      date,
      handle_id,
      payload_data,
      service,
      text
    ) VALUES
      (1, 'guid-1', X'0101', 100, 10, X'0201', 'iMessage', 'needle outside newest page'),
      (2, 'guid-2', X'0102', 200, 10, X'0202', 'iMessage', 'tied first'),
      (3, 'guid-3', X'0103', 200, 10, X'0203', 'iMessage', 'tied attachment regex alpha 42'),
      (4, 'guid-4', X'0104', 200, 10, X'0204', 'iMessage', 'tied third'),
      (5, 'guid-5', X'0105', 300, 10, X'0205', 'iMessage', 'anchor center'),
      (6, 'guid-6', X'0106', 400, 10, X'0206', 'iMessage', 'newer regular'),
      (7, 'guid-7', X'0107', 500, 10, X'0207', 'iMessage', 'latest regular'),
      (8, 'guid-8', X'0108', 600, 20, X'0208', 'iMessage', 'needle outside newest page other chat'),
      (9, 'guid-9', X'0109', 900, 30, X'0209', 'iMessage', 'bounded order'),
      (10, 'guid-10', X'0110', 50, 30, X'0210', 'iMessage', 'bounded order');
    INSERT INTO chat_message_join (chat_id, message_id, message_date) VALUES
      (1, 1, 100),
      (1, 2, 200),
      (1, 3, 200),
      (1, 4, 200),
      (1, 5, 300),
      (1, 6, 400),
      (1, 7, 500),
      (2, 8, 600),
      (3, 9, 900),
      (3, 10, 50);
    INSERT INTO attachment (ROWID, mime_type, filename, transfer_name) VALUES
      (301, 'image/png', '/tmp/one.png', 'one.png'),
      (302, 'image/jpeg', '/tmp/two.jpg', 'two.jpg');
    INSERT INTO message_attachment_join (message_id, attachment_id) VALUES
      (3, 301),
      (3, 302);
    UPDATE message SET thread_originator_guid = 'guid-3', thread_originator_part = '0:0:0' WHERE ROWID = 7;
  `);
  fixture
    .prepare("INSERT INTO message (ROWID, guid, date, handle_id, service, text) VALUES (?, ?, ?, ?, ?, ?)")
    .run(11, "guid-11", 1_000, 40, "iMessage", `${"a".repeat(100_000)}!`);
  fixture
    .prepare("INSERT INTO chat_message_join (chat_id, message_id, message_date) VALUES (?, ?, ?)")
    .run(4, 11, 1_000);
  fixture.close();

  const database = new SQLDatabase("Message pagination fixture", databasePath);
  try {
    await database.initialize();
    await database.waitForTextIndex();

    const latest = await database.getMessagesPage(1, { position: "latest", limit: 2 });
    assert.deepEqual(messageIds(latest.messages), [6, 7]);
    assert.equal(latest.hasOlder, true);
    assert.equal(latest.hasNewer, false);
    assert.deepEqual(latest.olderCursor, { date: "400", messageId: 6 });
    assert.equal(latest.newerCursor, null);
    assert.equal(latest.oldestPredecessor?.message_id, 5);
    assert.equal(latest.newestSuccessor, null);
    assert.deepEqual(latest.messages[1].reply_origin, {
      attachmentLabel: "Photo",
      guid: "guid-3",
      handle_id: 10,
      is_from_me: false,
      message_id: 3,
      text: "tied attachment regex alpha 42",
    });
    assertTransportSafe(latest.messages);

    const immediatelyOlder = await database.getMessagesPage(1, {
      cursor: latest.olderCursor,
      direction: "older",
      limit: 2,
    });
    const mergedWindow = mergeMessagePages([immediatelyOlder, latest]);
    assert.deepEqual(messageIds(mergedWindow), [4, 5, 6, 7]);
    assert.equal(immediatelyOlder.oldestPredecessor?.message_id, 3);
    assert.deepEqual(latest.oldestPredecessor, groupingContext(immediatelyOlder.messages.at(-1)!));
    assert.deepEqual(immediatelyOlder.newestSuccessor, groupingContext(latest.messages[0]));
    assert.equal(
      getPrependedMessageCount(
        [immediatelyOlder, latest],
        [{ cursor: latest.olderCursor, direction: "older" }, { position: "latest" }],
      ),
      2,
    );
    const targetKey = getTranscriptItemKey(0, latest.messages[0]);
    assert.equal(getTranscriptItemKey(2, mergedWindow[2]), targetKey, "stored-message keys must survive a prepend");
    assert.equal(getLocalMessageIndex(MESSAGE_VIRTUAL_INDEX_BASE, MESSAGE_VIRTUAL_INDEX_BASE - 2), 2);
    assert.equal(getTranscriptItemKey(0, { divider: true }), "ai-conversation-divider");
    assert.equal(
      getTranscriptItemKey(0, {
        content: "fixture",
        date: new Date(0),
        requestId: "request-1",
        role: "user",
      }),
      "ai:request-1:user:",
    );

    const reversePages = [messageIds(latest.messages)];
    let olderPage = latest;
    let reversePageCount = 1;
    while (olderPage.olderCursor) {
      assert.ok(reversePageCount < 10, "older cursor walk did not terminate");
      olderPage = await database.getMessagesPage(1, {
        cursor: olderPage.olderCursor,
        direction: "older",
        limit: 2,
      });
      assertTransportSafe(olderPage.messages);
      reversePages.unshift(messageIds(olderPage.messages));
      reversePageCount += 1;
    }
    assert.deepEqual(reversePages, [[1], [2, 3], [4, 5], [6, 7]]);
    const reverseIds = reversePages.flat();
    assert.deepEqual(reverseIds, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(new Set(reverseIds).size, reverseIds.length);

    const oldest = await database.getMessagesPage(1, { position: "oldest", limit: 2 });
    assert.deepEqual(messageIds(oldest.messages), [1, 2]);
    assert.equal(oldest.hasOlder, false);
    assert.equal(oldest.hasNewer, true);
    assert.equal(oldest.olderCursor, null);
    assert.equal(oldest.oldestPredecessor, null);
    assert.equal(oldest.newestSuccessor?.message_id, 3);
    assert.deepEqual(oldest.newerCursor, { date: "200", messageId: 2 });
    assertTransportSafe(oldest.messages);

    const forwardPages = [messageIds(oldest.messages)];
    let newerPage = oldest;
    let forwardPageCount = 1;
    while (newerPage.newerCursor) {
      assert.ok(forwardPageCount < 10, "newer cursor walk did not terminate");
      newerPage = await database.getMessagesPage(1, {
        cursor: newerPage.newerCursor,
        direction: "newer",
        limit: 2,
      });
      assertTransportSafe(newerPage.messages);
      forwardPages.push(messageIds(newerPage.messages));
      forwardPageCount += 1;
    }
    assert.deepEqual(forwardPages, [[1, 2], [3, 4], [5, 6], [7]]);
    const forwardIds = forwardPages.flat();
    assert.deepEqual(forwardIds, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(new Set(forwardIds).size, forwardIds.length);

    const anchored = await database.getMessagesPage(1, { anchorMessageId: 4, limit: 3 });
    assert.deepEqual(messageIds(anchored.messages), [3, 4, 5]);
    assert.equal(anchored.hasOlder, true);
    assert.equal(anchored.hasNewer, true);
    assert.equal(anchored.oldestPredecessor?.message_id, 2);
    assert.equal(anchored.newestSuccessor?.message_id, 6);
    assertTransportSafe(anchored.messages);

    const attachmentPage = await database.getMessagesPage(1, { anchorMessageId: 3, limit: 1 });
    assert.deepEqual(messageIds(attachmentPage.messages), [3]);
    assert.equal(attachmentPage.messages.length, 1);
    assert.deepEqual(
      [attachmentPage.messages[0], ...(attachmentPage.messages[0].attachmentMessages ?? [])].map(
        (message) => message.attachment_id,
      ),
      [301, 302],
    );
    assertTransportSafe(attachmentPage.messages);

    assert.equal(messageIds(latest.messages).includes(1), false);
    const literalSearch = await database.searchMessagesForChatId(1, "needle outside newest page", false, 10);
    assert.deepEqual(messageIds(literalSearch), [1]);
    assertTransportSafe(literalSearch);

    const boundedSearch = await database.searchMessagesForChatId(3, "bounded order", false, 1);
    assert.deepEqual(messageIds(boundedSearch), [9], "bounded search must select candidates by transcript chronology");

    const boundedRegexSearch = await database.searchMessagesForChatId(3, "bounded order", true, 1);
    assert.deepEqual(
      messageIds(boundedRegexSearch),
      [9],
      "bounded regex search must select candidates by transcript chronology",
    );

    const timedOutRegexSearch = assert.rejects(
      database.searchMessagesForChatId(4, String.raw`^(a+)+$`, true, 1),
      /timed out/,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    const concurrentPage = await database.getMessagesPage(1, { limit: 1 });
    assert.deepEqual(
      messageIds(concurrentPage.messages),
      [7],
      "message paging must remain responsive during regex work",
    );
    await timedOutRegexSearch;

    const regexSearch = await database.searchMessagesForChatId(1, String.raw`regex\s+alpha\s+\d+`, true, 10);
    assert.deepEqual(messageIds(regexSearch), [3]);
    assert.deepEqual(
      [regexSearch[0], ...(regexSearch[0].attachmentMessages ?? [])].map((message) => message.attachment_id),
      [301, 302],
    );
    assertTransportSafe(regexSearch);
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
