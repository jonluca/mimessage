import logger from "../utils/logger";
import type { OpenAIApi } from "openai";
import type { Chunk, SemanticSearchMetadata, SemanticSearchVector } from "./semantic-search";
import { isRateLimitExceeded } from "./semantic-search";
import { pRateLimit } from "p-ratelimit";
import { DataType, MilvusClient } from "@zilliz/milvus2-sdk-node";
import { DataType } from "@zilliz/milvus2-sdk-node/dist/milvus/const/Milvus";

export class BatchOpenAi {
  private openai: OpenAIApi;
  private batch: PendingVector[] = [];
  private batchSize = 250; // create 100 embeddings at a time with the openai api

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
const chromaLimit = pRateLimit({
  concurrency: 8, // no more than 60 running at once
});
export class BatchMilvus {
  private client: MilvusClient;
  private batch: SemanticSearchVector[] = [];
  private batchSize = 1000;

  flushPromise: Promise<void> | null = null;
  COLLECTION_NAME = "messages";
  constructor() {
    const address = "localhost:19530";
    const milvusClient = new MilvusClient(address);
    this.client = milvusClient;
  }

  query = async (vectors: number[][], text: string, limit = 100) => {
    const searchParams = {
      anns_field: "embedding",
      topk: String(limit),
      metric_type: "L2",
      params: JSON.stringify({ nprobe: 10 }),
    };

    const results = await this.client.search({
      collection_name: this.COLLECTION_NAME,
      expr: "",
      vectors,
      search_params: searchParams,
      vector_type: DataType.FloatVector,
    });
    return results;
  };

  getCollectionDetails = async () => {
    const collection = await this.client.getCollectionStatistics({
      collection_name: this.COLLECTION_NAME,
    });
    return collection;
  };
  createCollection = async () => {
    const hasCollection = await this.client.hasCollection({
      collection_name: this.COLLECTION_NAME,
    });
    if (hasCollection) {
      return;
    }
    const params = {
      collection_name: this.COLLECTION_NAME,
      description: "Message Search",
      fields: [
        {
          name: "embedding",
          description: "",
          data_type: DataType.FloatVector,
          type_params: {
            dim: "2",
          },
        },
        {
          name: "message_guid",
          data_type: DataType.String,
          is_primary_key: true,
          description: "",
        },
      ],
    };
    await this.client.createCollection(params);
  };

  loadCollection = async () => {
    await this.client.loadCollection({
      collection_name: this.COLLECTION_NAME,
    });
  };
  public async insert(vector: SemanticSearchVector[]) {
    const flushPromise = this.flushPromise;
    if (flushPromise) {
      await flushPromise;
    }
    this.batch.push(...vector);
    if (this.batch.length >= this.batchSize) {
      this.flushPromise = this.flush();
      await this.flushPromise;
    }
  }

  public async flush() {
    if (this.batch.length === 0) {
      return;
    }
    const batch = this.batch;
    this.batch = [];
    logger.info(`Inserting ${batch.length} vectors`);
    const data = batch.map((item) => {
      return {
        message_guid: item.id,
        embedding: item.values,
      };
    });
    try {
      await chromaLimit(async () => {
        const mr = await this.client.insert({
          collection_name: this.COLLECTION_NAME,
          fields_data: data,
        });
      });
    } catch (e) {
      logger.error(e);
    }
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
  const input = pendingVectors.map((c) => c.input);
  let timeout = 10_000;
  while (input.length) {
    try {
      const { data: embed } = await rateLimit(() =>
        openai.createEmbedding({
          input,
          model: OPENAI_EMBEDDING_MODEL,
        }),
      );
      const embeddings = embed.data;
      const vectors: SemanticSearchVector[] = [];
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
