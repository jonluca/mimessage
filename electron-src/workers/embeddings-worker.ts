import type { EmbeddingsDatabase } from "../data/embeddings-database";
import { expose } from "threads/worker";
import embeddingsDb from "../data/embeddings-database";

const exposed: Partial<Record<Partial<keyof EmbeddingsDatabase>, any>> = {};
for (const property in embeddingsDb) {
  const prop = property as keyof EmbeddingsDatabase;
  const dbElement = embeddingsDb[prop];
  if (typeof dbElement === "function") {
    exposed[prop] = dbElement;
  }
}

expose(exposed);
