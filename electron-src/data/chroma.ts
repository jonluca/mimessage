import type { Collection } from "chromadb";
import { ChromaClient } from "chromadb";

const COLLECTION_NAME = "mimessage-embeddings";
export const getCollection = async () => {
  try {
    const collection: Collection | null = await Promise.race([
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      (async () => {
        const client = new ChromaClient();
        const collections = await client.listCollections();
        const collection: Collection = collections.find((l: any) => l.name === COLLECTION_NAME)
          ? await client.getCollection(COLLECTION_NAME)
          : await client.createCollection(COLLECTION_NAME, {});

        return collection;
      })(),
    ]);

    return collection;
  } catch (e) {
    return null;
  }
};
