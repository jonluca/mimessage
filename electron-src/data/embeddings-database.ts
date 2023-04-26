import type { DB as EmbeddingsDb } from "../../_generated/embeddings-db";
import logger from "../utils/logger";
import { embeddingsDbPath } from "../utils/constants";
import BaseDatabase from "./base-database";
import type { BruteForceIndexUsize } from "horajs/pkg/horajs";
import fs from "fs/promises";
import { join, dirname } from "path";
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
    return result[0].count as number;
  };

  calculateSimilarity = async (embedding: Float32Array): Promise<string[]> => {
    await this.loadVectorsIntoMemory();

    const indexes = this.index!.search(embedding, 100);

    return [""];
  };
  loadVectorsIntoMemory = async () => {
    if (this.index) {
      return;
    }
    await this.initialize();

    const horaPromise = getVectorIdx();
    const resultPromise = this.db.selectFrom("text_embeddings").selectAll().execute();
    const [hora, result] = await Promise.all([horaPromise, resultPromise]);
    const index = hora.BruteForceIndexUsize.new(result[0].embedding?.length || 0);

    for (let i = 0; i < result.length; i++) {
      const r = result[i];
      const embedding = r.embedding!;
      const float32Array = new Float32Array(
        embedding.buffer,
        embedding.byteOffset,
        embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
      index.add(float32Array, i);
    }
    index.build("cosine_similarity");
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

CREATE INDEX handle_idx ON message_id_join(handle_id);
CREATE INDEX chat_idx ON message_id_join(chat_id);
CREATE INDEX date_idx ON message_id_join(message_date);
CREATE UNIQUE INDEX message_id_idx ON message_id_join(message_id);
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
