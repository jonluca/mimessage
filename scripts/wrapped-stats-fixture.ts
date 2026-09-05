import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import SqliteDb from "better-sqlite3";
import { SQLDatabase } from "../electron-src/data/database";
import { WRAPPED_HOUR_LABELS } from "../src/utils/wrapped-chart-labels";

const APPLE_EPOCH_MS = 978_307_200_000;
const toAppleNanoseconds = (date: Date) => (date.getTime() - APPLE_EPOCH_MS) * 1_000_000;

const run = async () => {
  assert.equal(WRAPPED_HOUR_LABELS.length, 24);
  assert.equal(new Set(WRAPPED_HOUR_LABELS).size, 24, "hour labels must not collapse across a local DST gap");
  assert.equal(WRAPPED_HOUR_LABELS[0], "12 AM");
  assert.equal(WRAPPED_HOUR_LABELS[2], "2 AM");
  assert.equal(WRAPPED_HOUR_LABELS[23], "11 PM");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mimessage-wrapped-fixture-"));
  const databasePath = path.join(directory, "messages.sqlite");
  const fixture = new SqliteDb(databasePath);
  fixture.exec(`
    CREATE TABLE message (
      guid TEXT NOT NULL,
      text TEXT,
      attributedBody BLOB,
      item_type INTEGER DEFAULT 0,
      associated_message_type INTEGER DEFAULT 0,
      handle_id INTEGER DEFAULT 0,
      date INTEGER,
      is_from_me INTEGER DEFAULT 0
    );
    CREATE TABLE chat (
      guid TEXT NOT NULL,
      chat_identifier TEXT,
      display_name TEXT
    );
    CREATE TABLE handle (
      id TEXT NOT NULL,
      country TEXT,
      service TEXT,
      uncanonicalized_id TEXT,
      person_centric_id TEXT
    );
    CREATE TABLE chat_message_join (
      chat_id INTEGER,
      message_id INTEGER,
      message_date INTEGER
    );
  `);
  fixture.prepare("INSERT INTO chat (ROWID, guid) VALUES (?, ?)").run(1, "chat-one");
  fixture.prepare("INSERT INTO chat (ROWID, guid) VALUES (?, ?)").run(2, "chat-two");
  fixture.prepare("INSERT INTO chat (ROWID, guid) VALUES (?, ?)").run(3, "chat-three");
  fixture.prepare("INSERT INTO chat (ROWID, guid) VALUES (?, ?)").run(4, "chat-four");
  fixture.prepare("INSERT INTO chat (ROWID, guid) VALUES (?, ?)").run(5, "chat-five");
  fixture.prepare("INSERT INTO handle (ROWID, id, service) VALUES (?, ?, ?)").run(1, "one@example.com", "iMessage");
  fixture.prepare("INSERT INTO handle (ROWID, id, service) VALUES (?, ?, ?)").run(2, "two@example.com", "iMessage");

  const insertMessage = fixture.prepare(
    `INSERT INTO message (guid, text, attributedBody, item_type, associated_message_type, handle_id, date, is_from_me)
     VALUES (?, ?, NULL, 0, 0, ?, ?, ?)`,
  );
  const joinMessage = fixture.prepare(
    "INSERT INTO chat_message_join (chat_id, message_id, message_date) VALUES (?, ?, ?)",
  );
  const addMessage = (
    guid: string,
    chatId: number,
    date: Date | null,
    handleId: number | null,
    isFromMe: boolean | null,
  ) => {
    const appleDate = date ? toAppleNanoseconds(date) : null;
    const result = insertMessage.run(guid, guid, handleId, appleDate, isFromMe === null ? null : Number(isFromMe));
    joinMessage.run(chatId, result.lastInsertRowid, appleDate);
  };

  addMessage("start-boundary", 1, new Date(2024, 0, 1, 0, 0, 0), 1, false);
  addMessage("before-dst-gap", 1, new Date(2024, 2, 10, 1, 30, 0), 2, false);
  addMessage("after-dst-gap", 1, new Date(2024, 2, 10, 3, 30, 0), null, true);
  addMessage("end-of-year", 1, new Date(2024, 11, 31, 23, 59, 59), 1, false);
  addMessage("next-year-boundary", 1, new Date(2025, 0, 1, 0, 0, 0), 1, false);
  addMessage("missing-date", 1, null, 2, false);
  addMessage("unknown-origin", 1, new Date(2024, 6, 4, 14, 0, 0), 2, null);
  addMessage("other-chat", 2, new Date(2024, 5, 1, 12, 0, 0), 2, false);
  for (const chatId of [3, 4]) {
    // Both messages at the first non-null timestamp are openers, even when a
    // chat has undated rows. Messages from a later selected year are not.
    addMessage(`undated-${chatId}`, chatId, null, 1, false);
    addMessage(`received-opener-${chatId}`, chatId, new Date(2023, 5, chatId), 1, false);
    addMessage(`sent-opener-${chatId}`, chatId, new Date(2023, 5, chatId), 1, true);
    addMessage(`later-${chatId}`, chatId, new Date(2024, 5, chatId), 1, false);
  }
  addMessage("undated-only", 5, null, 1, false);
  fixture.exec(`
    UPDATE message SET text = '  Hi There  ' WHERE guid LIKE 'received-opener-%';
    UPDATE message SET text = 'Hello Back' WHERE guid LIKE 'sent-opener-%';
    UPDATE message SET text = 'Hi There' WHERE guid LIKE 'later-%' OR guid LIKE 'undated-%';
  `);
  fixture.close();

  const database = new SQLDatabase("Wrapped fixture", databasePath);
  try {
    await database.initialize();
    const allTime = await database.calculateWrappedStats(0, [1]);
    assert.deepEqual(allTime.chartStats.byYear, [
      { year: 2024, count: 4 },
      { year: 2025, count: 1 },
    ]);
    assert.equal(
      allTime.chartStats.byYear.reduce((count, bucket) => count + bucket.count, 0),
      5,
      "unknown-origin rows must not inflate chart totals",
    );
    assert.equal(
      allTime.messageCount.sent + allTime.messageCount.received,
      6,
      "undated sent or received rows remain part of the overall message total",
    );
    assert.equal(allTime.chartStats.byMonth.length, 12);
    assert.equal(allTime.chartStats.byMonth[0], 2, "January should include both dated year boundaries");
    assert.equal(allTime.chartStats.byMonth[2], 2);
    assert.equal(allTime.chartStats.byMonth[11], 1, "a null date must not fall through to December");
    assert.equal(allTime.chartStats.byHour.length, 24);
    assert.equal(allTime.chartStats.byHour[0], 2);
    assert.equal(allTime.chartStats.byHour[1], 1);
    assert.equal(allTime.chartStats.byHour[2], 0, "the DST gap remains a real empty local-time bucket");
    assert.equal(allTime.chartStats.byHour[3], 1);
    assert.equal(allTime.chartStats.byHour[23], 1);
    assert.deepEqual(allTime.chartStats.byHandle, [
      { handleId: 1, count: 3 },
      { handleId: 2, count: 2 },
      { handleId: 0, count: 1 },
    ]);

    const weekdayCount = [...allTime.weekdayInteractions.sent, ...allTime.weekdayInteractions.received].reduce(
      (count, interaction) => count + Number(interaction.message_count || 0),
      0,
    );
    assert.equal(weekdayCount, 5, "a null date must not fall through to Saturday");

    const selectedYear = await database.calculateWrappedStats(2024, [1]);
    assert.equal(selectedYear.messageCount.sent + selectedYear.messageCount.received, 4);
    assert.deepEqual(selectedYear.chartStats.byYear, []);
    assert.equal(selectedYear.chartStats.byMonth[0], 1, "the exact Jan 1 lower boundary must be included");
    assert.equal(selectedYear.chartStats.byMonth[11], 1);

    const allChats = await database.calculateWrappedStats(2024);
    assert.equal(allChats.messageCount.sent + allChats.messageCount.received, 7, "chat filtering must stay scoped");
    assert.deepEqual(allChats.mostPopularOpeners, { received: [], sent: [] });

    const openers = await database.calculateWrappedStats(2023, [3, 4, 5]);
    assert.deepEqual(openers.mostPopularOpeners, {
      received: [{ text: "hi there", count: 2 }],
      sent: [{ text: "hello back", count: 2 }],
    });
    const allTimeOpeners = await database.calculateWrappedStats(0, [3, 4, 5]);
    assert.deepEqual(allTimeOpeners.mostPopularOpeners, openers.mostPopularOpeners);
    const scopedOpeners = await database.calculateWrappedStats(0, [3, 5]);
    assert.deepEqual(scopedOpeners.mostPopularOpeners, { received: [], sent: [] });
  } finally {
    await database.terminate();
    await fs.rm(directory, { force: true, recursive: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
