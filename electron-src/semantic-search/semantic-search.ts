import { GPT4Tokenizer } from "gpt4-tokenizer";
import { Configuration, OpenAIApi } from "openai";
import dbWorker from "../workers/database-worker";
import { handleIpc } from "../ipc/ipc";
import logger from "../utils/logger";
import { BatchOpenAi, OPENAI_EMBEDDING_MODEL } from "./batch-utils";
import pMap from "p-map";
import { uniqBy } from "lodash-es";

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

const PAGE_SIZE = 100_000;

export const createEmbeddings = async ({ openAiKey }: { openAiKey: string }) => {
  logger.info("Creating embeddings");
  numCompleted = 0;
  await dbWorker.embeddingsWorker.initialize();
  const messageCount = await dbWorker.worker.countAllMessageTexts();

  const pages = Math.ceil(messageCount / PAGE_SIZE);
  const existingText = await dbWorker.embeddingsWorker.getAllText();
  const set = new Set(existingText);

  const configuration = new Configuration({
    apiKey: openAiKey,
  });

  const openai = new OpenAIApi(configuration);

  const batchOpenai = new BatchOpenAi(openai);
  const processMessage = async (message: Awaited<ReturnType<typeof dbWorker.worker.getAllMessageTexts>>[number]) => {
    try {
      if (!message.text) {
        return;
      }

      const chunks = splitIntoChunks(message.text);
      const itemEmbeddings = await batchOpenai.addPendingVectors(chunks, message.guid);

      if (itemEmbeddings.length) {
        try {
          logger.info(`Inserting ${itemEmbeddings.length} vectors`);
          const embeddings = itemEmbeddings.map((l) => ({ embedding: l.values, text: l.metadata.text }));
          await dbWorker.embeddingsWorker.insertEmbeddings(embeddings);
          logger.info(`Inserted ${itemEmbeddings.length} vectors`);
          numCompleted += itemEmbeddings.length;
        } catch (e) {
          logger.error(e);
        }
      }
    } catch (e) {
      logger.error(e);
    }
    return [];
  };

  for (let i = 0; i < pages; i++) {
    const messages = await dbWorker.worker.getAllMessageTexts(PAGE_SIZE, i * PAGE_SIZE);
    logger.info(`Got ${messages.length} messages - ${i + 1} of ${pages}`);

    numCompleted = existingText.length;
    const notParsed = messages.filter((m) => m.text && !set.has(m.text));

    const uniqueMessages = uniqBy(notParsed, "text");

    await pMap(uniqueMessages, processMessage, { concurrency: 100 });

    if (debugLoggingEnabled) {
      logger.info(`Completed ${numCompleted} of ${messageCount} (${Math.round((numCompleted / messageCount) * 100)}%)`);
    }
  }
  logger.info("Done creating embeddings");
};

interface SemanticQueryOpts {
  openAiKey: string;
  queryText: string;
}

export async function semanticQuery({ queryText, openAiKey }: SemanticQueryOpts) {
  const existingEmbedding = await dbWorker.embeddingsWorker.getEmbeddingByText(queryText);
  let floatEmbedding = existingEmbedding?.embedding;

  if (!existingEmbedding) {
    const now = performance.now();
    const configuration = new Configuration({
      apiKey: openAiKey,
    });
    // first look up embedding in db in case we've already done it
    const openai = new OpenAIApi(configuration);
    const openAiResponse = await openai.createEmbedding({
      input: queryText,
      model: OPENAI_EMBEDDING_MODEL,
    });
    logger.info(`Got embedding from OpenAI in ${performance.now() - now}ms`);
    const embed = openAiResponse.data;
    const embedding = embed.data?.[0]?.embedding;
    if (!embedding) {
      return [];
    }
    // save embedding
    await dbWorker.embeddingsWorker.insertEmbeddings([{ embedding, text: queryText }]);
    floatEmbedding = new Float32Array(embedding);
  }

  const now = performance.now();
  const calculateSimilarity = await dbWorker.embeddingsWorker.calculateSimilarity(floatEmbedding!);
  logger.info(`Calculated similarity in ${performance.now() - now}ms`);
  return calculateSimilarity;
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
  const localDb = dbWorker.embeddingsWorker;
  try {
    await localDb.initialize();
    const count = await localDb.countEmbeddings();
    return { ...stats, completedAlready: count };
  } catch (e) {
    logger.error(e);
    return stats;
  }
});

handleIpc("messageCount", async () => {
  const stats = await dbWorker.worker.countAllMessageTexts(true);
  return stats;
});
handleIpc(
  "globalSearch",
  async (
    searchTerm: string,
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
    openAiKey?: string,
    useSemanticSearch?: boolean,
  ) => {
    if (!openAiKey || !searchTerm) {
      return [];
    }
    if (useSemanticSearch) {
      logger.info("Using semantic search");
      const now = performance.now();
      const messageTexts = await semanticQuery({
        openAiKey,
        queryText: searchTerm,
      });
      logger.info(`Got ${messageTexts.length} results in ${performance.now() - now}ms`);
      const guids = await dbWorker.worker.getMessageGuidsFromText(messageTexts);
      logger.info(`Got ${guids.length} guids from text`);
      return await dbWorker.worker.fullTextMessageSearchWithGuids(
        guids,
        searchTerm,
        chatIds,
        handleIds,
        startDate,
        endDate,
      );
    } else {
      return await dbWorker.worker.globalSearchTextBased(searchTerm, chatIds, handleIds, startDate, endDate);
    }
  },
);
