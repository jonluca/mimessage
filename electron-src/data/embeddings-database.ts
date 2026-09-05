import { randomUUID } from "node:crypto";
import type { DB as EmbeddingsDb } from "../../_generated/embeddings-db";
import logger from "../utils/logger";
import { embeddingsDbPath } from "../utils/constants";
import BaseDatabase from "./base-database";
import { cosineSimilarity, dotSimilarity, euclideanSimilarity } from "../semantic-search/vector-comparison";
import SqliteDb from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { sql } from "kysely";

const LEGACY_EMBEDDING_MODEL = "text-embedding-ada-002";
const LEGACY_GENERATION_ID = "legacy";
const LEGACY_SNAPSHOT_ID = "legacy-unverified";
const QUERY_CACHE_LIMIT = 256;
const IN_QUERY_PAGE_SIZE = 500;

interface EmbeddingSourceInput {
  chunkIndex: number;
  messageGuid: string;
  messageText: string;
  text: string;
}

interface SimilarityOptions {
  allowedTexts?: string[];
  model?: string;
  snapshotId?: string;
}

interface SemanticIndexState {
  active_generation_id: string | null;
  active_model: string | null;
  active_snapshot_id: string | null;
}

const getTableInfo = (db: Database, table: string) =>
  db.pragma(`table_info(${table})`) as Array<{ name: string; pk: number }>;

const hasDesiredPrimaryKey = (columns: Array<{ name: string; pk: number }>, names: string[]) => {
  const primaryKey = columns
    .filter((column) => column.pk > 0)
    .toSorted((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  return primaryKey.length === names.length && primaryKey.every((name, index) => name === names[index]);
};

/**
 * Rebuild the legacy source table when necessary. SQLite cannot change a
 * primary key in place, and staging requires old and new mappings for the same
 * message to coexist until promotion. The BLOB-heavy vector table is migrated
 * in place below.
 */
export const migrateEmbeddingsSchema = (db: Database) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const embeddingColumns = getTableInfo(db, "embeddings");
    if (!embeddingColumns.length) {
      db.exec(`
        CREATE TABLE embeddings (
          model TEXT NOT NULL,
          text TEXT PRIMARY KEY NOT NULL,
          embedding BLOB NOT NULL
        );
      `);
    } else if (!embeddingColumns.some((column) => column.name === "model")) {
      // Adding a constant-default column is metadata-only in modern SQLite. Do
      // not rebuild this BLOB-heavy table: that can require several GiB of
      // temporary disk and leaves the database file needlessly inflated.
      db.exec(`ALTER TABLE embeddings ADD COLUMN model TEXT NOT NULL DEFAULT '${LEGACY_EMBEDDING_MODEL}'`);
    }
    if (embeddingColumns.length && !hasDesiredPrimaryKey(embeddingColumns, ["text"])) {
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_text ON embeddings (text)");
    }

    const sourceColumns = getTableInfo(db, "embedding_sources");
    const sourceColumnNames = new Set(sourceColumns.map((column) => column.name));
    if (
      !sourceColumnNames.has("generation_id") ||
      !sourceColumnNames.has("message_text") ||
      !sourceColumnNames.has("model") ||
      !hasDesiredPrimaryKey(sourceColumns, ["generation_id", "message_guid", "chunk_index"])
    ) {
      db.exec(`
        DROP TABLE IF EXISTS embedding_sources_mimessage_v2;
        CREATE TABLE embedding_sources_mimessage_v2 (
          generation_id TEXT NOT NULL,
          message_guid TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          model TEXT NOT NULL,
          message_text TEXT NOT NULL,
          text TEXT NOT NULL,
          PRIMARY KEY (generation_id, message_guid, chunk_index)
        );
      `);
      if (sourceColumns.length) {
        const generationExpression = sourceColumnNames.has("generation_id")
          ? "generation_id"
          : `'${LEGACY_GENERATION_ID}'`;
        const modelExpression = sourceColumnNames.has("model") ? "model" : `'${LEGACY_EMBEDDING_MODEL}'`;
        const messageTextExpression = sourceColumnNames.has("message_text") ? "message_text" : "text";
        db.exec(`
          INSERT OR REPLACE INTO embedding_sources_mimessage_v2
            (generation_id, message_guid, chunk_index, model, message_text, text)
          SELECT ${generationExpression}, message_guid, chunk_index, ${modelExpression}, ${messageTextExpression}, text
          FROM embedding_sources;
          DROP TABLE embedding_sources;
        `);
      }
      db.exec("ALTER TABLE embedding_sources_mimessage_v2 RENAME TO embedding_sources");
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_embedding_sources_generation_text
      ON embedding_sources (generation_id, model, text);
      CREATE INDEX IF NOT EXISTS idx_embedding_sources_generation_message_text
      ON embedding_sources (generation_id, message_text);
      CREATE TABLE IF NOT EXISTS semantic_index_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_generation_id TEXT,
        active_snapshot_id TEXT,
        active_model TEXT
      );
      INSERT OR IGNORE INTO semantic_index_state (id, active_generation_id, active_snapshot_id, active_model)
      VALUES (1, NULL, NULL, NULL);
      CREATE TABLE IF NOT EXISTS query_embeddings (
        model TEXT NOT NULL,
        query_text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        last_used_at INTEGER NOT NULL,
        PRIMARY KEY (model, query_text)
      );
      CREATE INDEX IF NOT EXISTS idx_query_embeddings_last_used
      ON query_embeddings (last_used_at);
      UPDATE semantic_index_state
      SET active_generation_id = '${LEGACY_GENERATION_ID}',
          active_snapshot_id = '${LEGACY_SNAPSHOT_ID}',
          active_model = '${LEGACY_EMBEDDING_MODEL}'
      WHERE id = 1
        AND active_generation_id IS NULL
        AND EXISTS (
          SELECT 1 FROM embedding_sources WHERE generation_id = '${LEGACY_GENERATION_ID}' LIMIT 1
        );
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const toFloat32Array = (embedding: Buffer): Float32Array | null => {
  if (embedding.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    return null;
  }
  try {
    return new Float32Array(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
  } catch {
    return null;
  }
};

export class EmbeddingsDatabase extends BaseDatabase<EmbeddingsDb> {
  embeddingsCache: { text: string; embedding: Float32Array }[] = [];

  private getSemanticIndexState = async (): Promise<SemanticIndexState> => {
    const state = await this.db
      .selectFrom("semantic_index_state")
      .select(["active_generation_id", "active_model", "active_snapshot_id"])
      .where("id", "=", 1)
      .executeTakeFirst();
    return (
      state || {
        active_generation_id: null,
        active_model: null,
        active_snapshot_id: null,
      }
    );
  };

  countEmbeddings = async (): Promise<number> => {
    await this.initialize();
    const result = await this.db
      .selectFrom("embeddings")
      .select((expression) => expression.fn.count("embeddings.text").as("count"))
      .executeTakeFirst();
    return Number(result?.count || 0);
  };

  isSemanticIndexCurrent = async (snapshotId: string, model: string): Promise<boolean> => {
    await this.initialize();
    const state = await this.getSemanticIndexState();
    return Boolean(
      state.active_generation_id && state.active_snapshot_id === snapshotId && state.active_model === model,
    );
  };

  countCompletedMessages = async (snapshotId: string, model: string): Promise<number> => {
    await this.initialize();
    const state = await this.getSemanticIndexState();
    if (!state.active_generation_id || state.active_snapshot_id !== snapshotId || state.active_model !== model) {
      return 0;
    }
    const result = await sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM (
        SELECT sources.message_guid
        FROM embedding_sources AS sources
        LEFT JOIN embeddings AS vectors
          ON vectors.model = sources.model AND vectors.text = sources.text
        WHERE sources.generation_id = ${state.active_generation_id}
          AND sources.model = ${model}
        GROUP BY sources.message_guid
        HAVING COUNT(*) = COUNT(vectors.text)
      ) AS completed_messages
    `.execute(this.db);
    return Number(result.rows[0]?.count || 0);
  };

  beginSourceGeneration = async (snapshotId: string, model: string): Promise<string> => {
    await this.initialize();
    if (!snapshotId || !model) {
      throw new Error("A snapshot ID and embedding model are required to stage semantic sources");
    }
    const state = await this.getSemanticIndexState();
    await this.db.transaction().execute(async (transaction) => {
      let staleSources = transaction.deleteFrom("embedding_sources");
      if (state.active_generation_id) {
        staleSources = staleSources.where("generation_id", "!=", state.active_generation_id);
      }
      await staleSources.execute();
    });
    return randomUUID();
  };

  discardSourceGeneration = async (generationId: string): Promise<void> => {
    await this.initialize();
    const state = await this.getSemanticIndexState();
    if (state.active_generation_id === generationId) {
      // Promotion is atomic. If the Messages snapshot changed immediately
      // afterwards, retaining its old snapshot ID makes every currentness check
      // fail closed while preserving reusable vectors for the next rebuild.
      return;
    }
    // Keep successfully-created, model-keyed vectors so a retry does not pay to
    // recreate them. They cannot participate in ranking without an active source
    // mapping and are pruned by the next successful promotion.
    await this.db.deleteFrom("embedding_sources").where("generation_id", "=", generationId).execute();
  };

  promoteSourceGeneration = async (
    generationId: string,
    snapshotId: string,
    model: string,
    expectedMessageCount: number,
  ): Promise<void> => {
    await this.initialize();
    await this.db.transaction().execute(async (transaction) => {
      const stagedMessages = await transaction
        .selectFrom("embedding_sources")
        .select((expression) => expression.fn.count("message_guid").distinct().as("count"))
        .where("generation_id", "=", generationId)
        .where("model", "=", model)
        .executeTakeFirst();
      const stagedMessageCount = Number(stagedMessages?.count || 0);
      if (stagedMessageCount !== expectedMessageCount) {
        throw new Error(
          `Cannot promote semantic index: expected ${expectedMessageCount} messages, staged ${stagedMessageCount}`,
        );
      }
      const missing = await sql<{ count: number }>`
        SELECT COUNT(*) AS count
        FROM embedding_sources AS sources
        LEFT JOIN embeddings AS vectors
          ON vectors.model = sources.model AND vectors.text = sources.text
        WHERE sources.generation_id = ${generationId}
          AND sources.model = ${model}
          AND vectors.text IS NULL
      `.execute(transaction);
      const missingCount = Number(missing.rows[0]?.count || 0);
      if (missingCount) {
        throw new Error(`Cannot promote semantic index: ${missingCount} source chunks are missing embeddings`);
      }

      await transaction
        .updateTable("semantic_index_state")
        .set({
          active_generation_id: generationId,
          active_model: model,
          active_snapshot_id: snapshotId,
        })
        .where("id", "=", 1)
        .execute();
      await transaction.deleteFrom("embedding_sources").where("generation_id", "!=", generationId).execute();
      await sql`
        DELETE FROM embeddings
        WHERE NOT EXISTS (
          SELECT 1
          FROM embedding_sources AS sources
          WHERE sources.generation_id = ${generationId}
            AND sources.model = embeddings.model
            AND sources.text = embeddings.text
        )
      `.execute(transaction);
    });
  };

  calculateSimilarity = async (
    embedding: Float32Array,
    comparisonFunction: "cosine" | "euclidean" | "dot" = "cosine",
    options: SimilarityOptions = {},
  ) => {
    await this.initialize();
    const model = options.model || LEGACY_EMBEDDING_MODEL;
    const state = await this.getSemanticIndexState();
    if (
      !state.active_generation_id ||
      state.active_model !== model ||
      (options.snapshotId !== undefined && state.active_snapshot_id !== options.snapshotId)
    ) {
      return [];
    }
    if (options.allowedTexts && !options.allowedTexts.length) {
      return [];
    }

    const func =
      comparisonFunction === "cosine"
        ? cosineSimilarity
        : comparisonFunction === "euclidean"
          ? euclideanSimilarity
          : dotSimilarity;
    const prefersHigherScore = comparisonFunction !== "euclidean";
    const isBetter = (a: number, b: number) => (prefersHigherScore ? a > b : a < b);
    const isWorse = (a: number, b: number) => (prefersHigherScore ? a < b : a > b);
    const best: { similarity: number; text: string }[] = [];
    const siftWorstDown = (start: number) => {
      let parent = start;
      while (true) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let worse = parent;
        if (left < best.length && isWorse(best[left].similarity, best[worse].similarity)) {
          worse = left;
        }
        if (right < best.length && isWorse(best[right].similarity, best[worse].similarity)) {
          worse = right;
        }
        if (worse === parent) {
          return;
        }
        [best[parent], best[worse]] = [best[worse], best[parent]];
        parent = worse;
      }
    };

    const consider = (text: string, buffer: Buffer) => {
      const candidate = toFloat32Array(buffer);
      if (!candidate || candidate.length !== embedding.length) {
        return;
      }
      const similarity = func(embedding, candidate);
      if (!Number.isFinite(similarity)) {
        return;
      }
      const item = { similarity, text };
      if (best.length < 100) {
        best.push(item);
        if (best.length === 100) {
          for (let index = Math.floor(best.length / 2) - 1; index >= 0; index--) {
            siftWorstDown(index);
          }
        }
      } else if (isBetter(item.similarity, best[0].similarity)) {
        best[0] = item;
        siftWorstDown(0);
      }
    };

    const nativeDb = new SqliteDb(this.path, { fileMustExist: true, readonly: true });
    try {
      let allowedChunks: Set<string> | undefined;
      if (options.allowedTexts) {
        const allowedMessages = [...new Set(options.allowedTexts)];
        allowedChunks = new Set<string>();
        for (let offset = 0; offset < allowedMessages.length; offset += IN_QUERY_PAGE_SIZE) {
          const page = allowedMessages.slice(offset, offset + IN_QUERY_PAGE_SIZE);
          const placeholders = page.map(() => "?").join(", ");
          const sourceRows = nativeDb
            .prepare(
              `SELECT DISTINCT text
               FROM embedding_sources
               WHERE generation_id = ?
                 AND model = ?
                 AND message_text IN (${placeholders})`,
            )
            .iterate(state.active_generation_id, model, ...page) as Iterable<{ text: string }>;
          for (const source of sourceRows) {
            allowedChunks.add(source.text);
          }
        }
        if (!allowedChunks.size) {
          return [];
        }
      }

      if (allowedChunks) {
        const chunkTexts = [...allowedChunks];
        for (let offset = 0; offset < chunkTexts.length; offset += IN_QUERY_PAGE_SIZE) {
          const page = chunkTexts.slice(offset, offset + IN_QUERY_PAGE_SIZE);
          const placeholders = page.map(() => "?").join(", ");
          const rows = nativeDb
            .prepare(
              `SELECT text, embedding
               FROM embeddings
               WHERE model = ? AND text IN (${placeholders})`,
            )
            .iterate(model, ...page) as Iterable<{ embedding: Buffer; text: string }>;
          for (const row of rows) {
            consider(row.text, row.embedding);
          }
        }
      } else {
        const rows = nativeDb
          .prepare(
            `SELECT vectors.text, vectors.embedding
             FROM embeddings AS vectors
             WHERE vectors.model = ?
               AND EXISTS (
                 SELECT 1
                 FROM embedding_sources AS sources
                 WHERE sources.generation_id = ?
                   AND sources.model = vectors.model
                   AND sources.text = vectors.text
               )`,
          )
          .iterate(model, state.active_generation_id) as Iterable<{ embedding: Buffer; text: string }>;
        for (const row of rows) {
          consider(row.text, row.embedding);
        }
      }
    } finally {
      nativeDb.close();
    }

    best.sort((a, b) => (prefersHigherScore ? b.similarity - a.similarity : a.similarity - b.similarity));
    return best.map((item) => item.text);
  };

  loadVectorsIntoMemory = async () => {
    await this.initialize();
    logger.info("Semantic vectors will be streamed from SQLite to keep memory usage bounded");
  };

  embeddingsCacheSize = () => this.embeddingsCache.length;

  getEmbeddingByText = async (text: string, model = LEGACY_EMBEDDING_MODEL, snapshotId?: string) => {
    await this.initialize();
    const state = await this.getSemanticIndexState();
    if (
      !state.active_generation_id ||
      state.active_model !== model ||
      (snapshotId !== undefined && state.active_snapshot_id !== snapshotId)
    ) {
      return null;
    }
    const result = await this.db
      .selectFrom("embeddings as vectors")
      .select(["vectors.text", "vectors.embedding"])
      .where("vectors.model", "=", model)
      .where("vectors.text", "=", text)
      .where((expression) =>
        expression.exists(
          expression
            .selectFrom("embedding_sources as sources")
            .select("sources.text")
            .where("sources.generation_id", "=", state.active_generation_id!)
            .whereRef("sources.model", "=", "vectors.model")
            .whereRef("sources.text", "=", "vectors.text"),
        ),
      )
      .executeTakeFirst();
    if (!result) {
      return null;
    }
    const embedding = toFloat32Array(result.embedding);
    return embedding ? { text: result.text, embedding } : null;
  };

  getQueryEmbedding = async (queryText: string, model: string) => {
    await this.initialize();
    const result = await this.db
      .selectFrom("query_embeddings")
      .select(["query_text", "embedding"])
      .where("model", "=", model)
      .where("query_text", "=", queryText)
      .executeTakeFirst();
    if (!result) {
      return null;
    }
    await this.db
      .updateTable("query_embeddings")
      .set({ last_used_at: Date.now() })
      .where("model", "=", model)
      .where("query_text", "=", queryText)
      .execute();
    const embedding = toFloat32Array(result.embedding);
    return embedding ? { text: result.query_text, embedding } : null;
  };

  putQueryEmbedding = async (queryText: string, model: string, values: number[]): Promise<void> => {
    await this.initialize();
    const typedBuffer = new Float32Array(values);
    await this.db.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("query_embeddings")
        .values({
          embedding: Buffer.from(typedBuffer.buffer),
          last_used_at: Date.now(),
          model,
          query_text: queryText,
        })
        .onConflict((conflict) =>
          conflict.columns(["model", "query_text"]).doUpdateSet((expression) => ({
            embedding: expression.ref("excluded.embedding"),
            last_used_at: expression.ref("excluded.last_used_at"),
          })),
        )
        .execute();
      await sql`
        DELETE FROM query_embeddings
        WHERE rowid IN (
          SELECT rowid
          FROM query_embeddings
          ORDER BY last_used_at DESC, rowid DESC
          LIMIT -1 OFFSET ${QUERY_CACHE_LIMIT}
        )
      `.execute(transaction);
    });
  };

  getAllText = async (): Promise<string[]> => {
    await this.initialize();
    const result = await this.db.selectFrom("embeddings").select("text").distinct().execute();
    return result.map((row) => row.text);
  };

  getExistingText = async (texts: string[], model = LEGACY_EMBEDDING_MODEL): Promise<string[]> => {
    await this.initialize();
    if (!texts.length) {
      return [];
    }
    const existing: string[] = [];
    for (let offset = 0; offset < texts.length; offset += IN_QUERY_PAGE_SIZE) {
      const result = await this.db
        .selectFrom("embeddings")
        .select("text")
        .where("model", "=", model)
        .where("text", "in", texts.slice(offset, offset + IN_QUERY_PAGE_SIZE))
        .execute();
      existing.push(...result.map((row) => row.text));
    }
    return existing;
  };

  insertEmbeddingSources = async (
    generationId: string,
    model: string,
    sources: EmbeddingSourceInput[],
  ): Promise<void> => {
    await this.initialize();
    if (!sources.length) {
      return;
    }
    await this.db.transaction().execute(async (transaction) => {
      const pageSize = 500;
      for (let offset = 0; offset < sources.length; offset += pageSize) {
        await transaction
          .insertInto("embedding_sources")
          .values(
            sources.slice(offset, offset + pageSize).map((source) => ({
              chunk_index: source.chunkIndex,
              generation_id: generationId,
              message_guid: source.messageGuid,
              message_text: source.messageText,
              model,
              text: source.text,
            })),
          )
          .onConflict((conflict) =>
            conflict.columns(["generation_id", "message_guid", "chunk_index"]).doUpdateSet((expression) => ({
              message_text: expression.ref("excluded.message_text"),
              model: expression.ref("excluded.model"),
              text: expression.ref("excluded.text"),
            })),
          )
          .execute();
      }
    });
  };

  getMessageGuidsForText = async (
    texts: string[],
    snapshotId?: string,
    limit = 10_000,
    allowedMessageGuids?: string[],
  ): Promise<string[]> => {
    await this.initialize();
    if (!texts.length || limit <= 0) {
      return [];
    }
    const state = await this.getSemanticIndexState();
    if (
      !state.active_generation_id ||
      !state.active_model ||
      (snapshotId !== undefined && state.active_snapshot_id !== snapshotId)
    ) {
      return [];
    }

    const allowedMessages = allowedMessageGuids ? new Set(allowedMessageGuids) : undefined;
    if (allowedMessages?.size === 0) {
      return [];
    }
    const messageGuids: string[] = [];
    const seen = new Set<string>();
    const nativeDb = new SqliteDb(this.path, { fileMustExist: true, readonly: true });
    try {
      let scopedRows: Map<string, { message_guid: string }[]> | undefined;
      if (allowedMessages && allowedMessages.size <= IN_QUERY_PAGE_SIZE) {
        // A common text can belong to thousands of unrelated messages. For a
        // small filtered scope, use the generation/message primary key first.
        const placeholders = Array.from(allowedMessages, () => "?").join(", ");
        const rows = nativeDb
          .prepare(
            `SELECT rowid, model, text, message_guid
             FROM embedding_sources
             WHERE generation_id = ? AND message_guid IN (${placeholders})`,
          )
          .iterate(state.active_generation_id, ...allowedMessages) as Iterable<{
          rowid: number;
          model: string;
          text: string;
          message_guid: string;
        }>;
        const rankedTexts = new Set(texts);
        const matches = new Map<string, Map<string, number>>();
        for (const row of rows) {
          if (row.model !== state.active_model || !rankedTexts.has(row.text)) {
            continue;
          }
          let textMatches = matches.get(row.text);
          if (!textMatches) {
            textMatches = new Map();
            matches.set(row.text, textMatches);
          }
          const previousRowid = textMatches.get(row.message_guid);
          if (previousRowid === undefined || row.rowid < previousRowid) {
            textMatches.set(row.message_guid, row.rowid);
          }
        }
        // The text index yields source rows in rowid order. Preserve that order
        // within each ranked text, including messages with repeated chunks.
        scopedRows = new Map(
          [...matches].map(([text, textMatches]) => [
            text,
            [...textMatches].sort((a, b) => a[1] - b[1]).map(([messageGuid]) => ({ message_guid: messageGuid })),
          ]),
        );
      }
      const statement = nativeDb.prepare(
        `SELECT message_guid
         FROM embedding_sources
         WHERE generation_id = ? AND model = ? AND text = ?`,
      );
      for (const text of texts) {
        if (messageGuids.length >= limit) {
          break;
        }
        const rows = scopedRows
          ? scopedRows.get(text) || []
          : (statement.iterate(state.active_generation_id, state.active_model, text) as Iterable<{
              message_guid: string;
            }>);
        for (const row of rows) {
          if (allowedMessages && !allowedMessages.has(row.message_guid)) {
            continue;
          }
          if (!seen.has(row.message_guid)) {
            seen.add(row.message_guid);
            messageGuids.push(row.message_guid);
            if (messageGuids.length >= limit) {
              break;
            }
          }
        }
      }
    } finally {
      nativeDb.close();
    }
    return messageGuids;
  };

  insertEmbeddings = async (embeddings: { input: string; values: number[] }[], model = LEGACY_EMBEDDING_MODEL) => {
    await this.initialize();
    if (!embeddings.length) {
      return;
    }
    const values = embeddings.map((embedding) => {
      const typedBuffer = new Float32Array(embedding.values);
      return {
        embedding: Buffer.from(typedBuffer.buffer),
        model,
        text: embedding.input,
      };
    });
    await this.db
      .insertInto("embeddings")
      .values(values)
      .onConflict((conflict) =>
        conflict.column("text").doUpdateSet((expression) => ({
          embedding: expression.ref("excluded.embedding"),
          model: expression.ref("excluded.model"),
        })),
      )
      .execute();
    if (this.embeddingsCache.length) {
      this.embeddingsCache = [];
    }
  };
}

const embeddingsDb = new EmbeddingsDatabase("Embeddings DB", embeddingsDbPath, async (db) => {
  logger.info("Migrating semantic-search tables");
  migrateEmbeddingsSchema(db);
  logger.info("Semantic-search tables ready");
});

export default embeddingsDb;
