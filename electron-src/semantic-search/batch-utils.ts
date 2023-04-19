import logger from "../utils/logger";
import type { OpenAIApi } from "openai";
import type { Chunk, SemanticSearchMetadata, SemanticSearchVector } from "./semantic-search";
import { isRateLimitExceeded } from "./semantic-search";
import { pRateLimit } from "p-ratelimit";

export class BatchOpenAi {
  private openai: OpenAIApi;
  private batch: PendingVector[] = [];
  private batchSize = 500; // create 500 embeddings at a time with the openai api

  constructor(openai: OpenAIApi) {
    this.openai = openai;
  }

  async addPendingVectors(chunks: Chunk[], id: string) {
    const pendingVectors = chunks.map(({ text, start, end }, index) => {
      return {
        id: `${id}:${index}`,
        input: text,
        metadata: {
          index,
          id,
          text,
          end,
          start,
        },
      };
    });
    this.batch.push(...pendingVectors);

    if (this.batch.length >= this.batchSize) {
      return await this.flush();
    }
    return [];
  }

  async flush() {
    if (this.batch.length) {
      const batch = this.batch;
      this.batch = [];
      return await embeddingsFromPendingVectors(batch, this.openai);
    }
    return [];
  }
}

interface PendingVector {
  id: string;
  input: string;
  metadata: SemanticSearchMetadata;
}

export const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";

// create a rate limiter that allows up to 30 API calls per second,
// with max concurrency of 10
const rateLimit = pRateLimit({
  interval: 1000 * 60, // 1 minute
  rate: 3500, // 3500 calls per minute
  concurrency: 60, // no more than 60 running at once
});
const embeddingsFromPendingVectors = async (pendingVectors: PendingVector[], openai: OpenAIApi) => {
  const vectors: SemanticSearchVector[] = [];

  let timeout = 10_000;
  while (pendingVectors.length) {
    try {
      const input = pendingVectors.map((l) => l.input);
      const { data: embed } = await rateLimit(() =>
        openai.createEmbedding({
          input,
          model: OPENAI_EMBEDDING_MODEL,
        }),
      );
      const embeddings = embed.data;
      for (let i = 0; i < embeddings.length; i++) {
        const embedding = embeddings[i].embedding;
        if (embedding) {
          const vector: SemanticSearchVector = {
            id: pendingVectors[i].id,
            metadata: pendingVectors[i].metadata,
            values: embedding || [],
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
