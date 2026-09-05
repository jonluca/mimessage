import logger from "../utils/logger";
import type OpenAI from "openai";
import OpenAIClient from "openai";
import { pRateLimit } from "p-ratelimit";
import dbWorker from "../workers/database-worker";

export interface PendingEmbedding {
  input: string;
  tokenCount: number;
}

interface SemanticSearchVector {
  input: string;
  values: number[];
}

const MAX_BATCH_INPUTS = 2_048;
// The embeddings endpoint caps a request at 300,000 aggregate tokens. Keep
// headroom for tokenizer/model accounting differences.
const MAX_BATCH_TOKENS = 280_000;
const MAX_RATE_LIMIT_RETRIES = 6;

export class BatchOpenAi {
  private openai: OpenAI;
  private batch: PendingEmbedding[] = [];
  private batchTokens = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(openai: OpenAI) {
    this.openai = openai;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  addPendingVectors(chunks: PendingEmbedding[]): Promise<number> {
    return this.enqueue(async () => {
      let inserted = 0;
      for (const chunk of chunks) {
        const wouldOverflow =
          this.batch.length > 0 &&
          (this.batch.length >= MAX_BATCH_INPUTS || this.batchTokens + chunk.tokenCount > MAX_BATCH_TOKENS);
        if (wouldOverflow) {
          inserted += await this.flushUnsafe();
        }
        this.batch.push(chunk);
        this.batchTokens += chunk.tokenCount;
      }
      return inserted;
    });
  }

  flush(): Promise<number> {
    return this.enqueue(() => this.flushUnsafe());
  }

  private async flushUnsafe(): Promise<number> {
    if (!this.batch.length) {
      return 0;
    }

    // Leave pending work in place until both the API request and database write
    // succeed. A transient failure can then be retried without losing a batch.
    const batch = [...this.batch];
    const itemEmbeddings = await embeddingsFromPendingVectors(
      batch.map((item) => item.input),
      this.openai,
    );

    if (itemEmbeddings.length !== batch.length) {
      throw new Error(`OpenAI returned ${itemEmbeddings.length} embeddings for ${batch.length} inputs`);
    }
    await dbWorker.embeddingsWorker.insertEmbeddings(itemEmbeddings);
    this.batch.splice(0, batch.length);
    this.batchTokens = this.batch.reduce((sum, item) => sum + item.tokenCount, 0);
    return itemEmbeddings.length;
  }
}

export const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";

// create a rate limiter that allows up to 30 API calls per second,
// with max concurrency of 10
const rateLimit = pRateLimit({
  interval: 1000 * 60, // 1 minute
  rate: 3500, // 3500 calls per minute
  concurrency: 60, // no more than 60 running at once
});
const isRateLimitExceeded = (error: unknown): boolean => {
  return (
    error instanceof OpenAIClient.RateLimitError ||
    (typeof error === "object" && error !== null && "status" in error && error.status === 429)
  );
};

const embeddingsFromPendingVectors = async (pendingVectors: string[], openai: OpenAI) => {
  const vectors: SemanticSearchVector[] = [];

  let timeout = 10_000;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      const embed = await rateLimit(() =>
        openai.embeddings.create({
          input: pendingVectors,
          model: OPENAI_EMBEDDING_MODEL,
        }),
      );
      const embeddings = embed.data.toSorted((a, b) => a.index - b.index);
      for (const item of embeddings) {
        const embedding = item.embedding;
        if (embedding) {
          const vector: SemanticSearchVector = {
            values: embedding,
            input: pendingVectors[item.index],
          };
          vectors.push(vector);
        }
      }

      return vectors;
    } catch (err: unknown) {
      if (isRateLimitExceeded(err) && attempt < MAX_RATE_LIMIT_RETRIES) {
        logger.error("OpenAI rate limit exceeded, retrying in", timeout, "ms");
        await new Promise((resolve) => setTimeout(resolve, timeout));
        timeout = Math.min(timeout * 2, 60_000);
      } else {
        throw err;
      }
    }
  }
  return [];
};
