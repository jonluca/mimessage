import { GPT4Tokenizer } from "gpt4-tokenizer";
import { Configuration, OpenAIApi } from "openai";
import dbWorker from "./database-worker";
import { pRateLimit } from "p-ratelimit";
import { handleIpc } from "./ipc";
import type { Collection } from "chromadb";
import { ChromaClient } from "chromadb";
import logger from "../utils/logger";
import { chunk } from "lodash-es";

export interface SemanticSearchMetadata {
  id: string;
  text: string;
  start: number;
  end: number;
  [key: string]: any;
}

export interface SemanticSearchVector {
  id: string;
  values: number[];
  metadata: SemanticSearchMetadata;
}

export interface PostContent {
  chunks: Chunk[];
}

export interface Chunk {
  text: string;
  start: number;
  end: number;
}
const tokenizer = new GPT4Tokenizer({ type: "gpt3" });
const debugLoggingEnabled = process.env.DEBUG_LOGGING === "true";
const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
export const MAX_INPUT_TOKENS = 1000;

export function isRateLimitExceeded(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof err["response"] === "object" &&
    err["response"] !== null &&
    "status" in err.response &&
    err.response.status === 429
  );
}

let numCompleted = 0;

export async function getEmbeddings({
  content,
  id,
  openai,
  model = OPENAI_EMBEDDING_MODEL,
}: {
  content: PostContent;
  id: string;
  openai: OpenAIApi;
  model?: string;
}) {
  const pendingVectors = content.chunks.map(({ text, start, end }, index) => {
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

  const vectors: SemanticSearchVector[] = [];

  let timeout = 10_000;
  while (pendingVectors.length) {
    // We have 20 RPM on Free Trial, and 60 RPM on Pay-as-you-go plan, so we'll do exponential backoff.
    const pendingVector = pendingVectors.shift()!;
    try {
      const { data: embed } = await openai.createEmbedding({
        input: pendingVector.input,
        model,
      });

      const embedding = embed.data[0]?.embedding;
      if (!embedding) {
        continue;
      }
      const vector: SemanticSearchVector = {
        id: pendingVector.id,
        metadata: pendingVector.metadata,
        values: embedding || [],
      };

      vectors.push(vector);
    } catch (err: unknown) {
      if (isRateLimitExceeded(err)) {
        pendingVectors.unshift(pendingVector);
        console.log("OpenAI rate limit exceeded, retrying in", timeout, "ms");
        await new Promise((resolve) => setTimeout(resolve, timeout));
        timeout *= 2;
      } else {
        throw err;
      }
    }
  }

  return vectors;
}
const splitIntoChunks = (content: string, maxInputTokens = MAX_INPUT_TOKENS) => {
  const chunks: Chunk[] = [];

  let start = 0;

  const chunked = tokenizer.chunkText(content, maxInputTokens);

  for (const chunk of chunked) {
    chunks.push({
      start,
      end: start + chunk.text.length,
      text: chunk.text,
    });

    start += chunk.text.length + 1;
  }

  return chunks;
};
const COLLECTION_NAME = "mimessage-embeddings";

const getCollection = async () => {
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
export const createEmbeddings = async ({ openAiKey }: { openAiKey: string }) => {
  logger.info("Creating embeddings");
  numCompleted = 0;

  const messages = await dbWorker.worker.getAllMessageTexts();
  logger.info(`Got ${messages.length} messages`);
  const configuration = new Configuration({
    apiKey: openAiKey,
  });
  const openai = new OpenAIApi(configuration);

  const collection = await getCollection();

  if (!collection) {
    logger.error("Could not get collection");
    return;
  }

  // create a rate limiter that allows up to 30 API calls per second,
  // with max concurrency of 10
  const limit = pRateLimit({
    interval: 1000 * 60, // 1 minute
    rate: 3500, // 3500 calls per minute
    concurrency: 60, // no more than 60 running at once
  });
  const processMessage = async (message: (typeof messages)[number]) => {
    try {
      if (!message.text) {
        return;
      }

      const chunks = splitIntoChunks(message.text);
      const itemEmbeddings = await getEmbeddings({
        id: message.guid,
        content: { chunks },
        openai,
      });

      return itemEmbeddings;
    } catch (e) {
      logger.error(e);
    }
  };

  const chunked = chunk(messages, 1000);
  const notParsed = [];
  logger.info(`Checking if ${messages.length} messages have been parsed already`);
  for (const chunk of chunked) {
    const parsed = await collection.get(chunk.map((m) => `${m.guid}:0`));
    const parsedIds = new Set<string>(parsed.ids.map((m: string) => m.split(":")[0]));
    numCompleted += parsed.ids.length;
    const notSeen = chunk.filter((m) => !parsedIds.has(m.guid));
    notParsed.push(...notSeen);
  }
  logger.info(`Found ${notParsed.length} messages that need to be parsed`);
  const promises = notParsed.map(async (message) => {
    const itemEmbeddings = await limit(async () => {
      return processMessage(message);
    });

    if (itemEmbeddings && itemEmbeddings.length) {
      const ids = itemEmbeddings.map((item) => item.id);
      const embeddings = itemEmbeddings.map((item) => item.values);
      const text = itemEmbeddings.map((item) => item.metadata.text);
      const metadata = itemEmbeddings.map((item) => item.metadata);
      await collection.add(ids, embeddings, metadata, text);
    }
    numCompleted++;
    if (debugLoggingEnabled) {
      logger.info(
        `Completed ${numCompleted} of ${messages.length} (${Math.round((numCompleted / messages.length) * 100)}%)`,
      );
    }
  });
  await Promise.all(promises);
  logger.info("Done creating embeddings");
};

interface SemanticQueryOpts {
  openAiKey: string;
  queryText: string;
}

export async function semanticQuery({ queryText, openAiKey }: SemanticQueryOpts) {
  const configuration = new Configuration({
    apiKey: openAiKey,
  });
  const openai = new OpenAIApi(configuration);
  const collection = await getCollection();
  if (!collection) {
    logger.error("Could not get collection");
    return;
  }

  const embed = (
    await openai.createEmbedding({
      input: queryText,
      model: OPENAI_EMBEDDING_MODEL,
    })
  ).data;
  if (!embed.data?.[0]?.embedding) {
    return [];
  }
  return await collection.query(embed.data[0].embedding, 100, undefined, [queryText]);
}

handleIpc("createEmbeddings", async ({ openAiKey: openAiKey }) => {
  return await createEmbeddings({
    openAiKey,
  });
});

handleIpc("getEmbeddingsCompleted", async () => {
  return numCompleted;
});

handleIpc("calculateSemanticSearchStatsEnhanced", async () => {
  const stats = await dbWorker.worker.calculateSemanticSearchStats();
  const collection = await getCollection();
  if (!collection) {
    return stats;
  }
  const count = await collection.count();
  return { ...stats, completedAlready: count };
});
handleIpc(
  "semanticQuery",
  async (
    searchTerm: string,
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
    openAiKey?: string,
  ) => {
    if (!openAiKey || !searchTerm) {
      return [];
    }
    const queryResults = await semanticQuery({
      openAiKey,
      queryText: searchTerm,
    });

    return queryResults;
  },
);
