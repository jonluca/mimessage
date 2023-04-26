import type { DB as EmbeddingsDb } from "../../_generated/embeddings-db";
import logger from "../utils/logger";
import { embeddingsDbPath } from "../utils/constants";
import BaseDatabase from "./base-database";
import type { BruteForceIndexUsize } from "horajs/pkg/horajs";
import fs from "fs/promises";
import { join, dirname } from "path";
import type { MessageInfo } from "./types";
import { chunk } from "lodash-es";
const isDev = process.env.NODE_ENV !== "production";
const getVectorIdx = async () => {
  const { getHora } = await import("horajs");
  const horaPackage = dirname(require.resolve!("horajs"));
  const path = isDev ? join(horaPackage, "/pkg/horajs_bg.wasm") : "horajs_bg.wasm";
  const wasmFile = fs.readFile(path);
  const hora = await getHora(wasmFile);
  await hora.init_env();
  return hora;
};
export class EmbeddingsDatabase extends BaseDatabase<EmbeddingsDb> {
  index: BruteForceIndexUsize | null = null;
  countEmbeddings = async (): Promise<number> => {
    await this.initialize();
    const result = await this.db
      .selectFrom("text_embeddings")
      .select((e) => e.fn.count("text_embeddings.text").as("count"))
      .execute();
    return result[0].count as number;
  };
  countMessages = async (): Promise<number> => {
    await this.initialize();
    const result = await this.db
      .selectFrom("message_id_join")
      .select((e) => e.fn.count("ROWID").as("count"))
      .execute();
    return (result[0].count || 0) as number;
  };

  calculateSimilarity = async (embedding: Float32Array): Promise<number[]> => {
    await this.loadVectorsIntoMemory();

    const rowIds = this.index!.search(embedding, 100);
    const textEmbeddingIds = Array.from(rowIds);
    const joinedData = await this.db
      .selectFrom("text_embeddings")
      .leftJoin("message_id_join", "message_id_join.embedding_id", "text_embeddings.ROWID")
      .selectAll()
      .where("ROWID", "in", textEmbeddingIds)
      .execute();

    // sort
    const sorted = joinedData.slice(0, 200).sort((a, b) => {
      const aEmbeddingId = a.embedding_id!;
      const bEmbeddingId = b.embedding_id!;
      const aIndex = textEmbeddingIds.indexOf(aEmbeddingId);
      const bIndex = textEmbeddingIds.indexOf(bEmbeddingId);
      return aIndex - bIndex;
    });
    return sorted.map((r) => r.message_id!);
  };
  loadVectorsIntoMemory = async () => {
    if (this.index) {
      return;
    }
    await this.initialize();

    const horaPromise = getVectorIdx();
    const resultPromise = this.db.selectFrom("text_embeddings").selectAll().execute();
    const [hora, result] = await Promise.all([horaPromise, resultPromise]);
    const index = hora.BruteForceIndexUsize.new(1536);

    for (let i = 0; i < result.length; i++) {
      const r = result[i];
      try {
        const embedding = r.embedding!;
        const float32Array = new Float32Array(
          embedding.buffer,
          embedding.byteOffset,
          embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
        );
        index.add(float32Array, r.ROWID);
      } catch (e) {
        logger.error(e);
      }
    }
    const now = performance.now();
    index.build("cosine_similarity");
    logger.info(`Built index in ${performance.now() - now}ms`);
    this.index = index;
  };

  embeddingsCacheSize = () => {
    return this.index?.size() || 0;
  };
  getEmbeddingByText = async (text: string) => {
    await this.initialize();
    const result = await this.db.selectFrom("text_embeddings").where("text", "=", text).selectAll().executeTakeFirst();
    if (!result) {
      return null;
    }
    const embedding = result.embedding!;
    return {
      text: result.text,
      embedding: new Float32Array(
        embedding.buffer,
        embedding.byteOffset,
        embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
      ),
    };
  };

  getAllText = async (): Promise<string[]> => {
    await this.initialize();
    const result = await this.db.selectFrom("text_embeddings").select("text").execute();
    return result.map((l) => l.text!);
  };
  getExistingText = async (text: string[]): Promise<string[]> => {
    await this.initialize();
    const result = await this.db.selectFrom("text_embeddings").select("text").where("text", "in", text).execute();
    return result.map((l) => l.text!);
  };

  getMissingMessageIds = async (ids: number[]): Promise<number[]> => {
    await this.initialize();
    const result = await this.db
      .selectFrom("message_id_join")
      .select("message_id")
      .where("message_id", "in", ids)
      .execute();
    const existingIds = new Set(result.map((l) => l.message_id!));
    return ids.filter((id) => !existingIds.has(id));
  };

  private cleanText = (text: string) => {
    return (text || "")
      .replace(/[^a-zA-Z0-9]/g, " ")
      .trim()
      .toLowerCase();
  };
  addMessageMetadata = async (ids: MessageInfo) => {
    await this.initialize();
    const uniqText = [...new Set(ids.map((i) => i.text))];
    const result = await this.db
      .selectFrom("text_embeddings")
      .select(["ROWID", "text"])
      .where("text", "in", uniqText)
      .execute();
    const existingText = new Map(result.map((l) => [this.cleanText(l.text!), l.ROWID!]));
    const values = ids.map((i) => {
      if (!i.text) {
        return null;
      }
      const textId = existingText.get(this.cleanText(i.text));
      if (!textId) {
        return null;
      }
      return {
        message_id: i.message_id,
        chat_id: i.chat_id,
        handle_id: i.handle_id,
        embedding_id: textId,
        message_date: i.date,
      };
    });
    const chunks = chunk(
      values.filter((v) => v !== null),
      2_000,
    );

    const promises = chunks.map((c) => {
      return this.db.insertInto("message_id_join").values(c).execute();
    });

    return Promise.all(promises);
  };

  insertEmbeddings = async (embeddings: { input: string; values: number[] }[]) => {
    await this.initialize();
    const values = embeddings.map((e) => {
      const typedBuffer = new Float32Array(e.values);
      const buffer = Buffer.from(typedBuffer.buffer);
      return {
        text: e.input,
        embedding: buffer,
      };
    });
    const insert = this.db
      .insertInto("text_embeddings")
      .values(values)
      .onConflict((oc) => oc.column("text").doNothing());
    await insert.execute();
  };
}

const embeddingsDb = new EmbeddingsDatabase("Embeddings DB", embeddingsDbPath, async (db, ks) => {
  // create virtual table if not exists
  logger.info("Creating index table");
  db.exec(`
CREATE TABLE if not exists text_embeddings (
   ROWID INTEGER PRIMARY KEY AUTOINCREMENT UNIQUE NOT NULL,
   text TEXT NOT NULL,
   embedding BLOB NOT NULL
);

CREATE TABLE if not exists message_id_join (ROWID INTEGER PRIMARY KEY AUTOINCREMENT UNIQUE, embedding_id INTEGER REFERENCES text_embeddings (ROWID), message_id INTEGER, chat_id INTEGER, handle_id INTEGER, message_date INTEGER DEFAULT 0);

CREATE UNIQUE INDEX if not exists idx_embeddings ON text_embeddings (text);

CREATE INDEX IF NOT EXISTS handle_idx ON message_id_join(handle_id);
CREATE INDEX IF NOT EXISTS chat_idx ON message_id_join(chat_id);
CREATE INDEX IF NOT EXISTS date_idx ON message_id_join(message_date);
CREATE UNIQUE INDEX IF NOT EXISTS message_id_idx ON message_id_join(message_id);
      `);

  // this is part of the migration in case you have old versions of the db;
  const count = db
    .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='embeddings';")
    .get() as { count: number };
  if (count["count"] === 1) {
    db.exec(`
    INSERT INTO text_embeddings(text, embedding) SELECT text, embedding FROM embeddings;
    DROP TABLE embeddings;
    `);
  }

  logger.info("Creating index table done");
});

export default embeddingsDb;
