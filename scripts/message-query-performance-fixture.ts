import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import SqliteDb from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { CompiledQuery } from "kysely";
import type { DB } from "../_generated/types";
import { SQLDatabase } from "../electron-src/data/database";

const CHAT_COUNT = 1_000;
const MESSAGE_COUNT = 200_000;
const REPETITIONS = 7;
const APPLE_EPOCH_MS = 978_307_200_000;
const FIRST_MESSAGE_DATE = (new Date(2023, 0, 1).getTime() - APPLE_EPOCH_MS) * 1_000_000;

const run = async () => {
  const fixture = new SqliteDb(":memory:");
  const capturedQueries: CompiledQuery[] = [];
  const database = new SQLDatabase("Message query performance fixture", ":memory:");
  // Supply an isolated query connection without starting unrelated text indexing.
  database.dbWriter = new Kysely<DB>({
    dialect: new SqliteDialect({ database: fixture }),
    log: (event) => {
      if (event.level === "query") {
        capturedQueries.push(event.query);
      }
    },
  });

  try {
    fixture.exec(`
      CREATE TABLE chat (
        guid TEXT, chat_identifier TEXT, display_name TEXT,
        is_blackholed INTEGER DEFAULT 0, is_filtered INTEGER DEFAULT 0,
        last_read_message_timestamp INTEGER
      );
      CREATE TABLE message (
        guid TEXT, text TEXT, attributedBody BLOB, date INTEGER, handle_id INTEGER DEFAULT 1,
        is_from_me INTEGER DEFAULT 0, is_read INTEGER DEFAULT 1, is_spam INTEGER DEFAULT 0
      );
      CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER, message_date INTEGER);
      CREATE TABLE handle (id TEXT);
      CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
      CREATE INDEX chat_message_date ON chat_message_join(chat_id, message_date DESC, message_id DESC);
      CREATE INDEX join_message_id ON chat_message_join(message_id);
      WITH RECURSIVE ids(id) AS (
        SELECT 1 UNION ALL SELECT id + 1 FROM ids WHERE id < ${CHAT_COUNT}
      ) INSERT INTO chat(ROWID, guid) SELECT id, 'chat-' || id FROM ids;
      WITH RECURSIVE ids(id) AS (
        SELECT 1 UNION ALL SELECT id + 1 FROM ids WHERE id < ${MESSAGE_COUNT}
      ) INSERT INTO message(ROWID, guid, text, date, is_from_me)
        SELECT id, 'message-' || id, 'fixture opener ' || id % 10,
               ${FIRST_MESSAGE_DATE} + id * 3600000000000, id % 2 FROM ids;
      INSERT INTO chat_message_join
        SELECT ((ROWID - 1) % ${CHAT_COUNT}) + 1, ROWID, date FROM message;
      ANALYZE;
    `);

    await database.getChatList();
    await database.calculateWrappedStats(0);
    const chatQuery = capturedQueries.find((query) => query.sql.includes('"latest_message_date"'));
    const openerQuery = capturedQueries.find((query) => query.sql.includes('min("cmj2"."message_date")'));
    assert.ok(chatQuery, "capture the current production chat preview query");
    assert.ok(openerQuery, "capture the current production opener query");

    const legacyChat = fixture.prepare(`
      SELECT c.ROWID AS chat_id, c.guid AS chat_guid, c.is_blackholed, c.is_filtered,
             c.last_read_message_timestamp, m.date AS latest_message_date,
             m.is_from_me AS latest_message_is_from_me, m.is_read AS latest_message_is_read,
             m.is_spam AS latest_message_is_spam, text, attributedBody, chat_identifier, display_name
      FROM chat AS c
      JOIN chat_message_join AS cmj ON c.ROWID = cmj.chat_id
      JOIN message AS m ON cmj.message_id = m.ROWID
      WHERE cmj.message_id = (
        SELECT cmj2.message_id FROM chat_message_join AS cmj2
        WHERE cmj2.chat_id = c.ROWID
        ORDER BY cmj2.message_date DESC, cmj2.message_id DESC LIMIT 1
      ) ORDER BY m.date DESC
    `);
    const legacyOpenerSql = `
      SELECT message.is_from_me, text, attributedBody
      FROM message
      JOIN chat_message_join AS cmj ON cmj.message_id = message.ROWID
      JOIN chat AS c ON c.ROWID = cmj.chat_id
      WHERE cmj.message_date = (
        SELECT MIN(cmj2.message_date) FROM chat_message_join AS cmj2 WHERE cmj2.chat_id = c.ROWID
      )
    `;
    const currentChat = fixture.prepare(chatQuery.sql);
    const normalized = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).sort();
    const measure = (query: () => unknown[]) => {
      const durations: number[] = [];
      let rows: unknown[] = [];
      for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
        const start = performance.now();
        rows = query();
        durations.push(performance.now() - start);
      }
      durations.sort((left, right) => left - right);
      return { medianMs: Number(durations[Math.floor(REPETITIONS / 2)].toFixed(2)), rows };
    };

    const beforeChat = measure(() => legacyChat.all());
    const afterChat = measure(() => currentChat.all(...chatQuery.parameters));
    assert.deepEqual(afterChat.rows, beforeChat.rows, "chat previews and their order must remain identical");
    const openerResults: Record<string, { beforeMs: number; afterMs: number; rows: number }> = {};
    const scopes: Array<{ name: string; year: number; chatIds?: number[] }> = [
      { name: "allTime", year: 0 },
      { name: "selectedChats", year: 0, chatIds: [1, 2, 3, 4] },
      { name: "openingYear", year: 2023 },
      { name: "laterYear", year: 2024 },
    ];
    for (const scope of scopes) {
      let currentQuery = openerQuery;
      if (scope.name !== "allTime") {
        capturedQueries.length = 0;
        await database.calculateWrappedStats(scope.year, scope.chatIds);
        const query = capturedQueries.find((entry) => entry.sql.includes('min("cmj2"."message_date")'));
        assert.ok(query, `capture the production opener query for ${scope.name}`);
        currentQuery = query;
      }
      const parameters: number[] = [];
      let filterSql = "";
      if (scope.year) {
        filterSql += " AND message.date >= ? AND message.date < ?";
        parameters.push(
          (new Date(scope.year, 0, 1).getTime() - APPLE_EPOCH_MS) * 1_000_000,
          (new Date(scope.year + 1, 0, 1).getTime() - APPLE_EPOCH_MS) * 1_000_000,
        );
      }
      if (scope.chatIds) {
        filterSql += ` AND c.ROWID IN (${scope.chatIds.map(() => "?").join(", ")})`;
        parameters.push(...scope.chatIds);
      }
      const legacyOpeners = fixture.prepare(
        `${legacyOpenerSql}${filterSql} AND message.is_from_me = ? ORDER BY message.date ASC`,
      );
      const currentOpeners = fixture.prepare(currentQuery.sql);
      const before = measure(() => [...legacyOpeners.all(...parameters, 0), ...legacyOpeners.all(...parameters, 1)]);
      const after = measure(() => currentOpeners.all(...currentQuery.parameters));
      assert.deepEqual(
        normalized(after.rows),
        normalized(before.rows),
        `combined opener rows must match both original sender queries for ${scope.name}`,
      );
      openerResults[scope.name] = { beforeMs: before.medianMs, afterMs: after.medianMs, rows: after.rows.length };
    }

    console.log(
      JSON.stringify({
        fixture: { chats: CHAT_COUNT, messages: MESSAGE_COUNT, repetitions: REPETITIONS, analyzed: true },
        resultEquivalence: true,
        chatList: { beforeMs: beforeChat.medianMs, afterMs: afterChat.medianMs, rows: afterChat.rows.length },
        wrappedOpeners: openerResults,
      }),
    );
  } finally {
    await database.terminate();
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
