import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import SqliteDb from "better-sqlite3";
import { EmbeddingsDatabase, migrateEmbeddingsSchema } from "../electron-src/data/embeddings-database";
import { MessageTextIndex } from "../electron-src/data/text-index";
import { getStatsForText } from "../electron-src/semantic-search/semantic-search-stats";
import { getSemanticTokenizer } from "../electron-src/semantic-search/tokenizer";
import { getEmbeddingInputs } from "../electron-src/semantic-search/embedding-inputs";

const MODEL = "text-embedding-ada-002";
const GUID_LIMIT = 10_000;
const OUT_OF_SCOPE_DUPLICATES = GUID_LIMIT + 1;

const run = async () => {
  const emptyStats = await getStatsForText([]);
  assert.equal(emptyStats.averageTokensPerLine, 0);
  assert.equal(emptyStats.estimatedPrice, 0);
  assert.ok(Number.isFinite(emptyStats.estimatedTimeMin));

  const pricedStats = await getStatsForText(["A short embedding price fixture."]);
  assert.equal(pricedStats.estimatedPrice, (pricedStats.totalTokens / 1_000_000) * 0.1);
  assert.deepEqual(
    await getStatsForText(["", "A short embedding price fixture.", "A short embedding price fixture."]),
    pricedStats,
  );

  const tokenizer = await getSemanticTokenizer();
  assert.equal(await getSemanticTokenizer(), tokenizer, "indexing and stats share one lazy tokenizer");
  const textRecords = [
    { messageGuid: "long-1", text: "A longer message that has multiple chunks with the small fixture token limit." },
    { messageGuid: "empty", text: "" },
    { messageGuid: "long-2", text: "A longer message that has multiple chunks with the small fixture token limit." },
    { messageGuid: "unicode", text: "Hello, 世界 👋" },
  ];
  let encodedMessages = 0;
  const inputs = getEmbeddingInputs(
    textRecords,
    {
      encode: (text) => {
        encodedMessages++;
        return tokenizer.encode(text);
      },
      decode: (tokens) => tokenizer.decode(tokens),
    },
    7,
  );
  const referenceInputs = (records: typeof textRecords, maxTokens: number) =>
    records.flatMap((record) => {
      const tokens = tokenizer.encode(record.text);
      const chunks =
        tokens.length <= maxTokens
          ? [{ input: record.text, tokenCount: tokens.length }]
          : Array.from({ length: Math.ceil(tokens.length / maxTokens) }, (_, chunkIndex) => {
              const chunk = tokens.slice(chunkIndex * maxTokens, (chunkIndex + 1) * maxTokens);
              return { input: tokenizer.decode(chunk), tokenCount: chunk.length };
            });
      return chunks.map((chunk, chunkIndex) => ({
        ...chunk,
        chunkIndex,
        messageGuid: record.messageGuid,
        messageText: record.text,
      }));
    });
  assert.deepEqual(inputs, referenceInputs(textRecords, 7), "duplicate text retains every message's chunk provenance");
  assert.equal(encodedMessages, 3, "each unique text is tokenized once per source page");

  if (process.argv.includes("--benchmark")) {
    const page = Array.from({ length: 5_000 }, (_, index) => ({
      messageGuid: `benchmark-${index}`,
      text: `Message ${index % 50} ${"Please check the schedule and let me know if that time works for you. ".repeat(10)}`,
    }));
    assert.deepEqual(getEmbeddingInputs(page, tokenizer), referenceInputs(page, 7_000));
    const before: number[] = [];
    const after: number[] = [];
    for (let iteration = 0; iteration < 7; iteration++) {
      const beforeStarted = performance.now();
      referenceInputs(page, 7_000);
      before.push(performance.now() - beforeStarted);
      const afterStarted = performance.now();
      getEmbeddingInputs(page, tokenizer);
      after.push(performance.now() - afterStarted);
    }
    const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
    console.log(
      JSON.stringify({
        semanticPageTokenization: {
          records: page.length,
          uniqueTexts: 50,
          beforeMedianMs: median(before),
          afterMedianMs: median(after),
        },
      }),
    );
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mimessage-semantic-fixture-"));
  const databasePath = path.join(directory, "embeddings.sqlite");

  const legacyDb = new SqliteDb(databasePath);
  legacyDb.exec(`
    CREATE TABLE embeddings (
      text TEXT PRIMARY KEY NOT NULL,
      embedding BLOB NOT NULL
    );
    CREATE TABLE embedding_sources (
      message_guid TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (message_guid, chunk_index)
    );
    CREATE TABLE message (
      guid TEXT,
      text TEXT,
      attributedBody BLOB,
      item_type INTEGER NOT NULL,
      associated_message_type INTEGER NOT NULL,
      handle_id INTEGER,
      date INTEGER
    );
    CREATE TABLE chat_message_join (
      message_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL
    );
  `);
  const legacyVector = Buffer.from(new Float32Array([1, 0]).buffer);
  legacyDb.prepare("INSERT INTO embeddings (text, embedding) VALUES (?, ?)").run("legacy", legacyVector);
  legacyDb
    .prepare("INSERT INTO embedding_sources (message_guid, chunk_index, text) VALUES (?, ?, ?)")
    .run("legacy-guid", 0, "legacy");
  const insertMessage = legacyDb.prepare(
    `INSERT INTO message (guid, text, attributedBody, item_type, associated_message_type, handle_id, date)
     VALUES (?, ?, NULL, 0, 0, 1, 1)`,
  );
  const insertChatMessage = legacyDb.prepare("INSERT INTO chat_message_join (message_id, chat_id) VALUES (?, ?)");
  legacyDb.transaction(() => {
    for (let index = 0; index < OUT_OF_SCOPE_DUPLICATES; index += 1) {
      const result = insertMessage.run(`a-out-of-scope-${String(index).padStart(5, "0")}`, "shared full");
      insertChatMessage.run(result.lastInsertRowid, 1);
    }
    const result = insertMessage.run("z-in-scope", "shared full");
    insertChatMessage.run(result.lastInsertRowid, 2);
  })();
  const messageTextIndex = new MessageTextIndex(legacyDb);
  const filteredScope = await messageTextIndex.getMessageTextScopeForFilters({ chatIds: [2] });
  assert.deepEqual(filteredScope, { messageGuids: ["z-in-scope"], texts: ["shared full"] });
  await messageTextIndex.stop();
  legacyDb.close();

  const database = new EmbeddingsDatabase("Semantic fixture", databasePath, async (nativeDb) => {
    migrateEmbeddingsSchema(nativeDb);
  });

  try {
    await database.initialize();
    assert.deepEqual(
      await database.calculateSimilarity(new Float32Array([1, 0]), "cosine", {
        model: MODEL,
        snapshotId: "snapshot-1",
      }),
      [],
      "legacy sources must fail closed for a new Messages snapshot",
    );

    const firstGeneration = await database.beginSourceGeneration("snapshot-1", MODEL);
    const sharedTextSources = Array.from({ length: OUT_OF_SCOPE_DUPLICATES }, (_, index) => ({
      chunkIndex: 0,
      messageGuid: `a-out-of-scope-${String(index).padStart(5, "0")}`,
      messageText: "shared full",
      text: "shared",
    }));
    await database.insertEmbeddingSources(firstGeneration, MODEL, [
      ...sharedTextSources,
      { chunkIndex: 0, messageGuid: "alpha-1", messageText: "alpha full", text: "alpha" },
      { chunkIndex: 0, messageGuid: "alpha-2", messageText: "alpha duplicate", text: "alpha" },
      { chunkIndex: 0, messageGuid: "beta-1", messageText: "beta full", text: "beta" },
      { chunkIndex: 0, messageGuid: "z-in-scope", messageText: "shared full", text: "shared" },
      { chunkIndex: 1, messageGuid: "alpha-1", messageText: "alpha full", text: "alpha" },
      { chunkIndex: 2, messageGuid: "alpha-1", messageText: "alpha full", text: "shared" },
    ]);
    await database.insertEmbeddings(
      [
        { input: "alpha", values: [1, 0] },
        { input: "beta", values: [0, 1] },
        { input: "orphan", values: [0.9, 0.1] },
        { input: "shared", values: [0.8, 0.2] },
      ],
      MODEL,
    );
    const firstGenerationMessageCount = OUT_OF_SCOPE_DUPLICATES + 4;
    await database.promoteSourceGeneration(firstGeneration, "snapshot-1", MODEL, firstGenerationMessageCount);

    assert.equal(await database.countCompletedMessages("snapshot-1", MODEL), firstGenerationMessageCount);
    assert.deepEqual(
      await database.calculateSimilarity(new Float32Array([1, 0]), "cosine", {
        model: MODEL,
        snapshotId: "snapshot-1",
      }),
      ["alpha", "shared", "beta"],
      "orphan corpus vectors must not participate in ranking",
    );
    assert.deepEqual(
      await database.calculateSimilarity(new Float32Array([1, 0]), "cosine", {
        allowedTexts: ["beta full"],
        model: MODEL,
        snapshotId: "snapshot-1",
      }),
      ["beta"],
      "filtered ranking must use the original message text for chunk provenance",
    );
    assert.equal(
      (await database.getMessageGuidsForText(["alpha"], "snapshot-1", 1)).length,
      1,
      "GUID fanout must honor its hard limit",
    );
    assert.deepEqual(
      await database.getMessageGuidsForText(["shared"], "snapshot-1", GUID_LIMIT, filteredScope.messageGuids),
      ["z-in-scope"],
      "out-of-scope GUIDs sharing a ranked text must not consume the filtered fanout cap",
    );

    const referenceFanout = (texts: string[], limit: number, allowedGuids?: string[]) => {
      const readDb = new SqliteDb(databasePath, { readonly: true });
      try {
        const state = readDb.prepare("SELECT active_generation_id FROM semantic_index_state WHERE id = 1").get() as {
          active_generation_id: string;
        };
        const statement = readDb.prepare(
          "SELECT message_guid FROM embedding_sources WHERE generation_id = ? AND model = ? AND text = ?",
        );
        const allowed = allowedGuids ? new Set(allowedGuids) : undefined;
        const found = new Set<string>();
        for (const text of texts) {
          for (const row of statement.iterate(state.active_generation_id, MODEL, text) as Iterable<{
            message_guid: string;
          }>) {
            if (!allowed || allowed.has(row.message_guid)) {
              found.add(row.message_guid);
              if (found.size >= limit) {
                return [...found];
              }
            }
          }
        }
        return [...found];
      } finally {
        readDb.close();
      }
    };
    const rankedTexts = ["shared", "alpha", "missing", "beta", "shared"];
    const allowedGuids = ["missing", "beta-1", "alpha-2", "z-in-scope", "alpha-1", "alpha-1"];
    for (const scope of [
      undefined,
      [],
      ["missing"],
      allowedGuids,
      [...allowedGuids, ...Array.from({ length: 495 }, (_, index) => `missing-${index}`)],
      [...allowedGuids, ...Array.from({ length: 496 }, (_, index) => `missing-${index}`)],
    ]) {
      for (const limit of [1, 3, 10]) {
        assert.deepEqual(
          await database.getMessageGuidsForText(rankedTexts, "snapshot-1", limit, scope),
          referenceFanout(rankedTexts, limit, scope),
          "filtered fanout preserves rank, source order, repeated chunks, scope, and result caps",
        );
      }
    }
    assert.deepEqual(await database.getMessageGuidsForText(rankedTexts, "stale-snapshot", 10, allowedGuids), []);

    if (process.argv.includes("--benchmark")) {
      const before: number[] = [];
      const after: number[] = [];
      for (let iteration = 0; iteration < 7; iteration++) {
        const beforeStarted = performance.now();
        referenceFanout(["shared"], GUID_LIMIT, filteredScope.messageGuids);
        before.push(performance.now() - beforeStarted);
        const afterStarted = performance.now();
        await database.getMessageGuidsForText(["shared"], "snapshot-1", GUID_LIMIT, filteredScope.messageGuids);
        after.push(performance.now() - afterStarted);
      }
      const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
      console.log(
        JSON.stringify({
          semanticFilteredFanout: {
            candidatesBefore: OUT_OF_SCOPE_DUPLICATES + 2,
            allowedMessages: 1,
            beforeMedianMs: median(before),
            afterMedianMs: median(after),
          },
        }),
      );
    }

    for (let index = 0; index < 260; index += 1) {
      await database.putQueryEmbedding(`query-${index}`, MODEL, [index, 1]);
    }
    assert.ok(await database.getQueryEmbedding("query-259", MODEL));

    const incompleteGeneration = await database.beginSourceGeneration("snapshot-2", MODEL);
    await database.insertEmbeddingSources(incompleteGeneration, MODEL, [
      { chunkIndex: 0, messageGuid: "gamma-1", messageText: "gamma full", text: "gamma" },
    ]);
    await database.insertEmbeddings([{ input: "gamma", values: [0.5, 0.5] }], MODEL);
    await assert.rejects(() => database.promoteSourceGeneration(incompleteGeneration, "snapshot-2", MODEL, 2));
    assert.equal(await database.countCompletedMessages("snapshot-1", MODEL), firstGenerationMessageCount);
    await database.discardSourceGeneration(incompleteGeneration);
    assert.deepEqual(
      await database.getExistingText(["gamma"], MODEL),
      ["gamma"],
      "a failed generation must retain paid vectors for a retry",
    );

    const secondGeneration = await database.beginSourceGeneration("snapshot-2", MODEL);
    await database.insertEmbeddingSources(secondGeneration, MODEL, [
      { chunkIndex: 0, messageGuid: "gamma-1", messageText: "gamma full", text: "gamma" },
    ]);
    await database.promoteSourceGeneration(secondGeneration, "snapshot-2", MODEL, 1);

    const verificationDb = new SqliteDb(databasePath, { readonly: true });
    try {
      assert.deepEqual(
        verificationDb.prepare("SELECT text FROM embeddings ORDER BY text").all(),
        [{ text: "gamma" }],
        "promotion must prune vectors not referenced by the active generation",
      );
      const queryCount = verificationDb.prepare("SELECT COUNT(*) AS count FROM query_embeddings").get() as {
        count: number;
      };
      assert.equal(queryCount.count, 256, "query cache must stay bounded and survive corpus promotion");
    } finally {
      verificationDb.close();
    }
  } finally {
    await database.terminate();
    await fs.rm(directory, { force: true, recursive: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
