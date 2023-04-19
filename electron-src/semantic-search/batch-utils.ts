import logger from "../utils/logger";
import type { OpenAIApi } from "openai";
import type { SemanticSearchVector } from "./semantic-search";
import { isRateLimitExceeded } from "./semantic-search";
import { pRateLimit } from "p-ratelimit";
import dbWorker from "../workers/database-worker";

export class BatchOpenAi {
  private openai: OpenAIApi;
  private batch: string[] = [];
  private batchSize = 500;

  constructor(openai: OpenAIApi) {
    this.openai = openai;
  }

  async addPendingVectors(chunks: string[]): Promise<number> {
    this.batch.push(...chunks);

    if (this.batch.length >= this.batchSize) {
      return await this.flush();
    }
    return 0;
  }

  async flush(): Promise<number> {
    if (this.batch.length) {
      const batch = this.batch;
      this.batch = [];
      const itemEmbeddings = await embeddingsFromPendingVectors(batch, this.openai);

      if (itemEmbeddings.length) {
        try {
          await dbWorker.embeddingsWorker.insertEmbeddings(itemEmbeddings);
          return itemEmbeddings.length;
        } catch (e) {
          logger.error(e);
        }
      }
    }
    return 0;
  }
}

interface PendingVector {
  id: string;
  input: string;
}

export const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";

// create a rate limiter that allows up to 30 API calls per second,
// with max concurrency of 10
const rateLimit = pRateLimit({
  interval: 1000 * 60, // 1 minute
  rate: 3500, // 3500 calls per minute
  concurrency: 60, // no more than 60 running at once
});
const embeddingsFromPendingVectors = async (pendingVectors: string[], openai: OpenAIApi) => {
  const vectors: SemanticSearchVector[] = [];

  let timeout = 10_000;
  while (pendingVectors.length) {
    try {
      const { data: embed } = await rateLimit(() =>
        openai.createEmbedding({
          input: pendingVectors,
          model: OPENAI_EMBEDDING_MODEL,
        }),
      );
      const embeddings = embed.data;
      for (let i = 0; i < embeddings.length; i++) {
        const embedding = embeddings[i].embedding;
        if (embedding) {
          const vector: SemanticSearchVector = {
            values: embedding || [],
            input: pendingVectors[i],
          };
          vectors.push(vector);
        }
      }

      return vectors;
    } catch (err: unknown) {
      if (isRateLimitExceeded(err)) {
        logger.error("OpenAI rate limit exceeded, retrying in", timeout, "ms");
        await new Promise((resolve) => setTimeout(resolve, timeout));
        timeout *= 2;
      } else {
        throw err;
      }
    }
  }
  return [];
};
