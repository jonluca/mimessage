import { GPT4Tokenizer } from "gpt4-tokenizer";
import { Configuration, OpenAIApi } from "openai";
import dbWorker from "../workers/database-worker";
import { handleIpc } from "../ipc/ipc";
import logger from "../utils/logger";
import { BatchOpenAi, OPENAI_EMBEDDING_MODEL } from "./batch-utils";
import pMap from "p-map";

export interface SemanticSearchVector {
  input: string;
  values: number[];
}

const tokenizer = new GPT4Tokenizer({ type: "gpt3" });
const debugLoggingEnabled = process.env.DEBUG_LOGGING === "true";

export const MAX_INPUT_TOKENS = 7000;

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
  if (content.length < 2000) {
    return [content];
  }
  const chunks: string[] = [];

  const encoded = tokenizer.encode(content);
  for (let i = 0; i < encoded.length; i += maxInputTokens) {
    const chunk = encoded.slice(i, i + maxInputTokens);
    chunks.push(tokenizer.decode(chunk));
  }
  return chunks;
};

const PAGE_SIZE = 30_000;

export const createEmbeddings = async ({ openAiKey }: { openAiKey: string }) => {
  logger.info("Creating embeddings");
  numCompleted = 0;
  await dbWorker.embeddingsWorker.initialize();
  const messageCount = await dbWorker.worker.countAllMessageTexts();

  const pages = Math.ceil(messageCount / PAGE_SIZE);

  const configuration = new Configuration({
    apiKey: openAiKey,
  });

  const openai = new OpenAIApi(configuration);

  const batchOpenai = new BatchOpenAi(openai);
  const processMessage = async (message: string) => {
    try {
      if (!message) {
        return;
      }

      const chunks = splitIntoChunks(message);
      const itemEmbeddings = await batchOpenai.addPendingVectors(chunks);
      if (itemEmbeddings.length) {
        try {
          await dbWorker.embeddingsWorker.insertEmbeddings(itemEmbeddings);
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
    const now = performance.now();
    const existingText = await dbWorker.embeddingsWorker.getExistingText(messages);
    logger.info(`Got existing text in ${performance.now() - now}ms`);
    const set = new Set(existingText);
    numCompleted += existingText.length;
    const notParsed = messages.filter((m) => !set.has(m));
    await pMap(notParsed, processMessage, { concurrency: 50 });
    logger.info(`Completed ${numCompleted} of ${messageCount} (${Math.round((numCompleted / messageCount) * 100)}%)`);
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
    await dbWorker.embeddingsWorker.insertEmbeddings([{ values: embedding, input: queryText }]);
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
