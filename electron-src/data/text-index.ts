import type { Database } from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import logger from "../utils/logger";
import { getTextFromBuffer } from "../utils/buffer";
import { searchRegexRowsInWorker } from "./regex-worker-search";

const INDEX_SCHEMA_VERSION = 2;
const DEFAULT_CHUNK_SIZE = 1_000;
const MAX_BUILD_ATTEMPTS = 3;
const MAX_CONCURRENT_REGEX_SEARCHES = 2;
const BUILD_RETRY_DELAY_MS = 500;
const NULL_MESSAGE_DATE_SQL = "-9223372036854775808";
const ELIGIBLE_MESSAGE_SQL = "m.item_type NOT IN (1, 3, 4, 5, 6) AND m.associated_message_type = 0";

interface IndexState {
  schema_version: number;
  last_rowid: number;
  source_max_rowid: number;
  source_message_count: number;
  projected_message_count: number;
  source_fingerprint: string;
  complete: number;
}

interface SourceStats {
  max_rowid: number;
  message_count: number;
}

interface SourceMessage {
  rowId: number;
  guid: string | null;
  text: string | null;
  attributedBody: Buffer | null;
}

interface ProjectedMessage {
  rowId: number;
  messageGuid: string;
  text: string;
  textHash: string;
}

export interface MessageTextRecord {
  messageGuid: string;
  text: string;
}

export interface FilteredMessageTextScope {
  messageGuids: string[];
  texts: string[];
}

export interface MessageTextIndexStatus {
  schemaVersion: number;
  lastRowId: number;
  sourceMaxRowId: number;
  sourceMessageCount: number;
  projectedMessageCount: number;
  sourceFingerprint: string;
  complete: boolean;
}

export interface TextSearchFilters {
  chatIds?: number[];
  handleIds?: number[];
  startDate?: number;
  endDate?: number;
}

class TextIndexBuildCancelledError extends Error {}

const normalizeText = (text: string | null | undefined) => {
  if (typeof text !== "string") {
    return null;
  }
  const normalized = text.trim().replace(/[\u{FFFC}-\u{FFFD}]/gu, "");
  return normalized || null;
};

const placeholders = (values: unknown[]) => values.map(() => "?").join(", ");
const hashText = (text: string) => createHash("sha256").update(text).digest("hex");
const dropIndexTables = (database: Database) => {
  database.exec(`
    DROP TABLE IF EXISTS message_fts;
    DROP TABLE IF EXISTS mimessage_text_projection;
    DROP TABLE IF EXISTS mimessage_text_index_state;
  `);
};

/** Invalidates only MiMessage-owned projection data on an explicit database handle. */
export const invalidateMessageTextIndex = (database: Database) => {
  database.transaction(() => dropIndexTables(database))();
};

export class MessageTextIndex {
  private readonly database: Database;
  private readonly chunkSize: number;
  private buildPromise: Promise<void> | undefined;
  private cancelRequested = false;
  private readonly regexSearchControllers = new Set<AbortController>();

  constructor(database: Database, chunkSize = DEFAULT_CHUNK_SIZE) {
    this.database = database;
    this.chunkSize = chunkSize;
  }

  start = (): Promise<void> => {
    if (!this.buildPromise) {
      this.cancelRequested = false;
      const buildPromise = this.buildWithRetries();
      this.buildPromise = buildPromise;
      void buildPromise.catch((error) => {
        if (this.buildPromise === buildPromise) {
          this.buildPromise = undefined;
        }
        if (!(error instanceof TextIndexBuildCancelledError)) {
          logger.error("Message text index build failed");
          logger.error(error instanceof Error ? error : String(error));
        }
      });
    }
    return this.buildPromise;
  };

  stop = async () => {
    this.cancelRequested = true;
    for (const controller of this.regexSearchControllers) {
      controller.abort();
    }
    this.regexSearchControllers.clear();
    const buildPromise = this.buildPromise;
    try {
      await buildPromise;
    } catch {
      // Build errors are surfaced to complete-corpus callers. Termination still
      // needs to close the database and worker deterministically.
    } finally {
      if (this.buildPromise === buildPromise) {
        this.buildPromise = undefined;
      }
    }
  };

  getStatus = (): MessageTextIndexStatus | null => {
    const stateTableExists = Boolean(
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mimessage_text_index_state'")
        .get(),
    );
    if (!stateTableExists) {
      return null;
    }
    let state: IndexState | undefined;
    try {
      state = this.database
        .prepare(
          `SELECT schema_version, last_rowid, source_max_rowid, source_message_count,
                  projected_message_count, source_fingerprint, complete
           FROM mimessage_text_index_state
           WHERE singleton = 1`,
        )
        .get() as IndexState | undefined;
    } catch {
      return null;
    }
    if (!state) {
      return null;
    }
    return {
      schemaVersion: state.schema_version,
      lastRowId: state.last_rowid,
      sourceMaxRowId: state.source_max_rowid,
      sourceMessageCount: state.source_message_count,
      projectedMessageCount: state.projected_message_count,
      sourceFingerprint: state.source_fingerprint,
      complete: Boolean(state.complete),
    };
  };

  getDistinctTexts = async (limit?: number, offset?: number): Promise<string[]> => {
    await this.start();
    const pagination = this.getPagination(limit, offset);
    const rows = this.database
      .prepare(
        `SELECT p.text
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE ${ELIGIBLE_MESSAGE_SQL}
         GROUP BY p.text
         ORDER BY MAX(p.message_rowid) DESC
         ${pagination.sql}`,
      )
      .all(...pagination.parameters) as Array<{ text: string }>;
    return rows.map((row) => row.text);
  };

  countDistinctTexts = async (): Promise<number> => {
    await this.start();
    const row = this.database
      .prepare(
        `SELECT COUNT(DISTINCT p.text) AS count
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE ${ELIGIBLE_MESSAGE_SQL}`,
      )
      .get() as { count: number };
    return Number(row.count);
  };

  getTextRecords = async (limit?: number, offset?: number): Promise<MessageTextRecord[]> => {
    await this.start();
    const pagination = this.getPagination(limit, offset);
    return this.database
      .prepare(
        `SELECT p.message_guid AS messageGuid, p.text
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE ${ELIGIBLE_MESSAGE_SQL}
         ORDER BY p.message_rowid DESC
         ${pagination.sql}`,
      )
      .all(...pagination.parameters) as MessageTextRecord[];
  };

  countTextRecords = async (): Promise<number> => {
    await this.start();
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE ${ELIGIBLE_MESSAGE_SQL}`,
      )
      .get() as { count: number };
    return Number(row.count);
  };

  getDistinctTextsForFilters = async (filters: TextSearchFilters): Promise<string[]> => {
    await this.start();
    const filter = this.getFilterSql(filters);
    const rows = this.database
      .prepare(
        `SELECT DISTINCT p.text
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE ${ELIGIBLE_MESSAGE_SQL}${filter.sql}`,
      )
      .all(...filter.parameters) as Array<{ text: string }>;
    return rows.map((row) => row.text);
  };

  getMessageTextScopeForFilters = async (filters: TextSearchFilters): Promise<FilteredMessageTextScope> => {
    await this.start();
    const filter = this.getFilterSql(filters);
    const rows = this.database
      .prepare(
        `SELECT p.message_guid AS messageGuid, p.text
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE ${ELIGIBLE_MESSAGE_SQL}${filter.sql}`,
      )
      .all(...filter.parameters) as MessageTextRecord[];
    const messageGuids = new Set<string>();
    const texts = new Set<string>();
    for (const row of rows) {
      messageGuids.add(row.messageGuid);
      texts.add(row.text);
    }
    return { messageGuids: [...messageGuids], texts: [...texts] };
  };

  getMessageGuidsForTexts = async (texts: string[], limit = 10_000): Promise<string[]> => {
    await this.start();
    if (!texts.length || limit <= 0) {
      return [];
    }

    const indexByText = new Map(texts.map((text, index) => [text, index]));
    const rows: Array<{ messageGuid: string; text: string }> = [];
    for (let index = 0; index < texts.length; index += 500) {
      const page = texts.slice(index, index + 500);
      const hashes = page.map(hashText);
      const remaining = limit - rows.length;
      if (remaining <= 0) {
        break;
      }
      rows.push(
        ...(
          this.database
            .prepare(
              `SELECT message_guid AS messageGuid, text
             FROM mimessage_text_projection
             WHERE text_hash IN (${placeholders(hashes)})
             LIMIT ?`,
            )
            .all(...hashes, remaining) as Array<{ messageGuid: string; text: string }>
        ).filter((row) => indexByText.has(row.text)),
      );
    }

    rows.sort(
      (left, right) =>
        (indexByText.get(left.text) ?? Number.MAX_SAFE_INTEGER) -
        (indexByText.get(right.text) ?? Number.MAX_SAFE_INTEGER),
    );
    return rows.slice(0, limit).map((row) => row.messageGuid);
  };

  searchFts = async (query: string, filters: TextSearchFilters, limit: number): Promise<string[]> => {
    await this.start();
    if (!query.trim() || limit <= 0) {
      return [];
    }

    const filter = this.getFilterSql(filters);
    const rows = this.database
      .prepare(
        `SELECT message_fts.message_id AS messageGuid
         FROM message_fts
         JOIN message AS m ON m.ROWID = message_fts.rowid
         WHERE message_fts MATCH ? AND ${ELIGIBLE_MESSAGE_SQL}${filter.sql}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, ...filter.parameters, limit) as Array<{ messageGuid: string }>;
    return rows.map((row) => row.messageGuid);
  };

  searchSubstring = async (query: string, filters: TextSearchFilters, limit: number): Promise<string[]> => {
    await this.start();
    if (!query || limit <= 0) {
      return [];
    }

    const filter = this.getFilterSql(filters);
    const escapedQuery = query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const rows = this.database
      .prepare(
        `SELECT p.message_guid AS messageGuid
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE p.text LIKE ? ESCAPE '\\' AND ${ELIGIBLE_MESSAGE_SQL}${filter.sql}
         ORDER BY COALESCE(m.date, ${NULL_MESSAGE_DATE_SQL}) DESC, m.ROWID DESC
         LIMIT ?`,
      )
      .all(`%${escapedQuery}%`, ...filter.parameters, limit) as Array<{ messageGuid: string }>;
    return rows.map((row) => row.messageGuid);
  };

  searchRegex = async (query: string, filters: TextSearchFilters, limit: number): Promise<string[]> => {
    if (!query || limit <= 0) {
      return [];
    }

    await this.start();
    const filter = this.getFilterSql(filters);
    const rows = this.database
      .prepare(
        `SELECT p.message_guid AS messageGuid, p.text
         FROM mimessage_text_projection AS p
         JOIN message AS m ON m.ROWID = p.message_rowid
         WHERE ${ELIGIBLE_MESSAGE_SQL}${filter.sql}
         ORDER BY COALESCE(m.date, ${NULL_MESSAGE_DATE_SQL}) DESC, m.ROWID DESC`,
      )
      .iterate(...filter.parameters) as IterableIterator<MessageTextRecord>;
    while (this.regexSearchControllers.size >= MAX_CONCURRENT_REGEX_SEARCHES) {
      const oldestController = this.regexSearchControllers.values().next().value;
      if (!oldestController) {
        break;
      }
      this.regexSearchControllers.delete(oldestController);
      oldestController.abort();
    }
    const controller = new AbortController();
    this.regexSearchControllers.add(controller);
    try {
      return await searchRegexRowsInWorker(query, rows, limit, { signal: controller.signal });
    } finally {
      this.regexSearchControllers.delete(controller);
    }
  };

  getDistinctTextsForYearAndChats = async (year: number, chatIds?: number[]): Promise<string[]> => {
    const filters: TextSearchFilters = { chatIds };
    if (year !== 0) {
      filters.startDate = (new Date(year, 0, 1).getTime() - 978_307_200_000) * 1_000_000;
      filters.endDate = (new Date(year + 1, 0, 1).getTime() - 978_307_200_000) * 1_000_000;
    }
    return this.getDistinctTextsForFilters(filters);
  };

  private buildWithRetries = async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt += 1) {
      this.throwIfCancelled();
      try {
        await this.build();
        return;
      } catch (error) {
        if (error instanceof TextIndexBuildCancelledError) {
          throw error;
        }
        lastError = error;
        logger.error(`Message text index build attempt ${attempt}/${MAX_BUILD_ATTEMPTS} failed`);
        logger.error(error instanceof Error ? error : String(error));
        if (attempt < MAX_BUILD_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, BUILD_RETRY_DELAY_MS));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Message text index failed to build");
  };

  private build = async () => {
    const state = this.initializeState();
    if (state.complete) {
      logger.info(`Message text index is ready through ROWID ${state.last_rowid}`);
      return;
    }

    logger.info(
      `Building message text index from ROWID ${state.last_rowid + 1} through ${state.source_max_rowid} in ${this.chunkSize}-row chunks`,
    );
    const selectBatch = this.database.prepare(
      `SELECT ROWID AS rowId, guid, text, attributedBody
       FROM message
       WHERE ROWID > ? AND ROWID <= ?
       ORDER BY ROWID
       LIMIT ?`,
    );
    const upsertProjection = this.database.prepare(
      `INSERT INTO mimessage_text_projection(message_rowid, message_guid, text, text_hash)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(message_rowid) DO UPDATE SET
         message_guid = excluded.message_guid,
         text = excluded.text,
         text_hash = excluded.text_hash`,
    );
    const insertFts = this.database.prepare("INSERT INTO message_fts(rowid, text, message_id) VALUES (?, ?, ?)");
    const updateProgress = this.database.prepare(
      `UPDATE mimessage_text_index_state
       SET last_rowid = ?, projected_message_count = ?
       WHERE singleton = 1`,
    );
    const commitBatch = this.database.transaction(
      (projected: ProjectedMessage[], lastRowId: number, projectedMessageCount: number) => {
        for (const message of projected) {
          upsertProjection.run(message.rowId, message.messageGuid, message.text, message.textHash);
          insertFts.run(message.rowId, message.text, message.messageGuid);
        }
        updateProgress.run(lastRowId, projectedMessageCount);
      },
    );

    let lastRowId = state.last_rowid;
    let projectedMessageCount = state.projected_message_count;
    let rowsProcessed = 0;
    const startedAt = performance.now();
    while (lastRowId < state.source_max_rowid) {
      this.throwIfCancelled();
      const rows = selectBatch.all(lastRowId, state.source_max_rowid, this.chunkSize) as SourceMessage[];
      if (!rows.length) {
        break;
      }

      const projected: ProjectedMessage[] = [];
      for (const row of rows) {
        this.throwIfCancelled();
        let text = normalizeText(row.text);
        if (!text && row.attributedBody) {
          text = normalizeText(await getTextFromBuffer(row.attributedBody));
        }
        if (text && row.guid) {
          projected.push({ rowId: row.rowId, messageGuid: row.guid, text, textHash: hashText(text) });
        }
      }

      this.throwIfCancelled();
      lastRowId = rows[rows.length - 1].rowId;
      projectedMessageCount += projected.length;
      commitBatch(projected, lastRowId, projectedMessageCount);
      rowsProcessed += rows.length;
      if (rowsProcessed % 25_000 < this.chunkSize) {
        logger.info(`Message text index processed ${rowsProcessed} rows this run (through ROWID ${lastRowId})`);
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    this.throwIfCancelled();
    this.database
      .prepare("UPDATE mimessage_text_index_state SET last_rowid = ?, complete = 1 WHERE singleton = 1")
      .run(state.source_max_rowid);
    logger.info(`Message text index completed ${rowsProcessed} rows in ${Math.round(performance.now() - startedAt)}ms`);
  };

  private initializeState = (): IndexState => {
    const sourceStats = this.database
      .prepare("SELECT COALESCE(MAX(ROWID), 0) AS max_rowid, COUNT(*) AS message_count FROM message")
      .get() as SourceStats;
    const hasCurrentStateSchema = this.tableHasColumns("mimessage_text_index_state", [
      "singleton",
      "schema_version",
      "last_rowid",
      "source_max_rowid",
      "source_message_count",
      "projected_message_count",
      "source_fingerprint",
      "complete",
    ]);
    const hasCurrentProjectionSchema = this.tableHasColumns("mimessage_text_projection", [
      "message_rowid",
      "message_guid",
      "text",
      "text_hash",
    ]);
    const hasCurrentFtsSchema = this.tableHasColumns("message_fts", ["text", "message_id"]);
    if (!hasCurrentStateSchema || !hasCurrentProjectionSchema || !hasCurrentFtsSchema) {
      return this.resetIndex(sourceStats);
    }

    this.database.exec(`
      CREATE INDEX IF NOT EXISTS mimessage_text_projection_guid ON mimessage_text_projection(message_guid);
      CREATE INDEX IF NOT EXISTS mimessage_text_projection_hash ON mimessage_text_projection(text_hash);
    `);
    const existingState = this.database
      .prepare(
        `SELECT schema_version, last_rowid, source_max_rowid, source_message_count,
                projected_message_count, source_fingerprint, complete
         FROM mimessage_text_index_state
         WHERE singleton = 1`,
      )
      .get() as IndexState | undefined;
    const projectionStats = this.database
      .prepare(
        `SELECT COUNT(*) AS message_count, COALESCE(MAX(message_rowid), 0) AS max_rowid
         FROM mimessage_text_projection`,
      )
      .get() as SourceStats;
    const ftsStats = this.database.prepare("SELECT COUNT(*) AS message_count FROM message_fts").get() as {
      message_count: number;
    };
    const projectionMissingFromFts = Boolean(
      this.database
        .prepare(
          `SELECT 1
           FROM mimessage_text_projection AS p
           LEFT JOIN message_fts ON message_fts.rowid = p.message_rowid
           WHERE message_fts.rowid IS NULL
           LIMIT 1`,
        )
        .get(),
    );

    const canResume =
      existingState?.schema_version === INDEX_SCHEMA_VERSION &&
      Boolean(existingState.source_fingerprint) &&
      existingState.source_max_rowid === sourceStats.max_rowid &&
      existingState.source_message_count === sourceStats.message_count &&
      existingState.last_rowid >= 0 &&
      existingState.last_rowid <= sourceStats.max_rowid &&
      existingState.projected_message_count === projectionStats.message_count &&
      existingState.projected_message_count === ftsStats.message_count &&
      projectionStats.max_rowid <= existingState.last_rowid &&
      !projectionMissingFromFts &&
      (!existingState.complete || existingState.last_rowid === sourceStats.max_rowid);
    if (canResume) {
      return existingState;
    }

    return this.resetIndex(sourceStats);
  };

  private resetIndex = (sourceStats: SourceStats): IndexState => {
    const sourceFingerprint = randomUUID();
    const complete = sourceStats.message_count === 0 ? 1 : 0;
    const resetIndex = this.database.transaction(() => {
      dropIndexTables(this.database);
      this.database.exec(`
        CREATE TABLE mimessage_text_index_state (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          schema_version INTEGER NOT NULL,
          last_rowid INTEGER NOT NULL,
          source_max_rowid INTEGER NOT NULL,
          source_message_count INTEGER NOT NULL,
          projected_message_count INTEGER NOT NULL,
          source_fingerprint TEXT NOT NULL,
          complete INTEGER NOT NULL CHECK(complete IN (0, 1))
        );
        CREATE TABLE mimessage_text_projection (
          message_rowid INTEGER PRIMARY KEY,
          message_guid TEXT NOT NULL,
          text TEXT NOT NULL,
          text_hash TEXT NOT NULL
        );
        CREATE INDEX mimessage_text_projection_guid ON mimessage_text_projection(message_guid);
        CREATE INDEX mimessage_text_projection_hash ON mimessage_text_projection(text_hash);
        CREATE VIRTUAL TABLE message_fts USING fts5(text, message_id UNINDEXED);
      `);
      this.database
        .prepare(
          `INSERT INTO mimessage_text_index_state(
             singleton, schema_version, last_rowid, source_max_rowid, source_message_count,
             projected_message_count, source_fingerprint, complete
           ) VALUES (1, ?, 0, ?, ?, 0, ?, ?)`,
        )
        .run(INDEX_SCHEMA_VERSION, sourceStats.max_rowid, sourceStats.message_count, sourceFingerprint, complete);
    });
    resetIndex();
    return {
      schema_version: INDEX_SCHEMA_VERSION,
      last_rowid: 0,
      source_max_rowid: sourceStats.max_rowid,
      source_message_count: sourceStats.message_count,
      projected_message_count: 0,
      source_fingerprint: sourceFingerprint,
      complete,
    };
  };

  private tableHasColumns = (tableName: string, requiredColumns: string[]) => {
    const tableExists = Boolean(
      this.database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName),
    );
    if (!tableExists) {
      return false;
    }
    const escapedTableName = tableName.replace(/"/g, '""');
    const columns = this.database.prepare(`PRAGMA table_info("${escapedTableName}")`).all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    return requiredColumns.every((column) => columnNames.has(column));
  };

  private getPagination = (limit?: number, offset?: number) => {
    if (limit === undefined && offset === undefined) {
      return { sql: "", parameters: [] as number[] };
    }
    return {
      sql: "LIMIT ? OFFSET ?",
      parameters: [limit === undefined ? -1 : Math.max(0, Math.floor(limit)), Math.max(0, Math.floor(offset ?? 0))],
    };
  };

  private getFilterSql = (filters: TextSearchFilters) => {
    const clauses: string[] = [];
    const parameters: number[] = [];
    if (filters.chatIds?.length) {
      clauses.push(
        `EXISTS (
           SELECT 1 FROM chat_message_join AS filtered_cmj
           WHERE filtered_cmj.message_id = m.ROWID
             AND filtered_cmj.chat_id IN (${placeholders(filters.chatIds)})
         )`,
      );
      parameters.push(...filters.chatIds);
    }
    if (filters.handleIds?.length) {
      clauses.push(`m.handle_id IN (${placeholders(filters.handleIds)})`);
      parameters.push(...filters.handleIds);
    }
    if (filters.startDate !== undefined) {
      clauses.push("m.date > ?");
      parameters.push(filters.startDate);
    }
    if (filters.endDate !== undefined) {
      clauses.push("m.date < ?");
      parameters.push(filters.endDate);
    }
    return {
      sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
      parameters,
    };
  };

  private throwIfCancelled = () => {
    if (this.cancelRequested) {
      throw new TextIndexBuildCancelledError("Message text index build was cancelled");
    }
  };
}

export default MessageTextIndex;
