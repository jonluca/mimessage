import type { DB as EmbeddingsDb } from "../../_generated/embeddings-db";
import logger from "../utils/logger";
import { embeddingsDbPath } from "../utils/constants";
import BaseDatabase from "./base-database";

export class EmbeddingsDatabase extends BaseDatabase<EmbeddingsDb> {
  embeddingsCache: { text: string; embedding: Float32Array }[] = [];
  countEmbeddings = async (): Promise<number> => {
    await this.initialize();
    const result = await this.db
      .selectFrom("embeddings")
      .select((e) => e.fn.count("embeddings.text").as("count"))
      .execute();
    return result[0].count as number;
  };

  getAllEmbeddings = async () => {
    if (this.embeddingsCache.length) {
      return this.embeddingsCache;
    }
    await this.initialize();
    const result = await this.db.selectFrom("embeddings").selectAll().execute();

    this.embeddingsCache = result.map((r) => {
      const embedding = r.embedding!;
      return {
        text: r.text,
        embedding: new Float32Array(
          embedding.buffer,
          embedding.byteOffset,
          embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
        ),
      };
    });
    return this.embeddingsCache;
  };
  getEmbeddingByText = async (text: string) => {
    await this.initialize();
    const result = await this.db.selectFrom("embeddings").where("text", "=", text).selectAll().executeTakeFirst();
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
    const result = await this.db.selectFrom("embeddings").select("text").execute();
    return result.map((l) => l.text!);
  };

  insertEmbeddings = async (embeddings: { text: string; embedding: number[] }[]) => {
    await this.initialize();
    const values = embeddings.map((e) => {
      const typedBuffer = new Float32Array(e.embedding);
      const buffer = Buffer.from(typedBuffer.buffer);
      return {
        text: e.text,
        embedding: buffer,
      };
    });
    const insert = this.db
      .insertInto("embeddings")
      .values(values)
      .onConflict((oc) => oc.column("text").doNothing());
    await insert.execute();
  };
}

const embeddingsDb = new EmbeddingsDatabase("Embeddings DB", embeddingsDbPath, async (db) => {
  // create virtual table if not exists
  logger.info("Creating index table");
  await db.exec(`
CREATE TABLE if not exists embeddings (
   text TEXT PRIMARY KEY NOT NULL,
   embedding BLOB NOT NULL
);
CREATE UNIQUE INDEX if not exists idx_embeddings
ON embeddings (text);
      `);
  logger.info("Creating index table done");
});

export default embeddingsDb;
