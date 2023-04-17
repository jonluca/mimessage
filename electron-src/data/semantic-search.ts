import { GPT4Tokenizer } from "gpt4-tokenizer";
import { Configuration, OpenAIApi } from "openai";
import dbWorker from "./database-worker";
import { handleIpc } from "./ipc";
import logger from "../utils/logger";
import { chunk } from "lodash-es";
import { BatchChroma, BatchOpenAi, OPENAI_EMBEDDING_MODEL } from "./batch-utils";
import { getCollection } from "./chroma";
import pMap from "p-map";

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

  // remove already parsed messages
  const chunked = chunk(messages, 5000);
  const notParsed = [];
  logger.info(`Checking if ${messages.length} messages have been parsed already`);

  for (const chunk of chunked) {
    const parsed = await collection.get(chunk.map((m) => `${m.guid}:0`));
    const parsedIds = new Set<string>(parsed.ids.map((m: string) => m.split(":")[0]));
    numCompleted += parsedIds.size;
    for (const m of chunk) {
      if (!parsedIds.has(m.guid)) {
        notParsed.push(m);
      }
    }
  }
  logger.info(`Found ${notParsed.length} messages that need to be parsed`);

  const batchChroma = new BatchChroma(collection);
  const batchOpenai = new BatchOpenAi(openai);

  const processMessage = async (message: (typeof messages)[number]) => {
    try {
      if (!message.text) {
        return;
      }

      const chunks = splitIntoChunks(message.text);
      const itemEmbeddings = await batchOpenai.addPendingVectors(chunks, message.guid);

      if (itemEmbeddings && itemEmbeddings.length) {
        await batchChroma.insert(itemEmbeddings);
        numCompleted += itemEmbeddings.length;
      }

      if (debugLoggingEnabled) {
        logger.info(
          `Completed ${numCompleted} of ${messages.length} (${Math.round((numCompleted / messages.length) * 100)}%)`,
        );
      }
    } catch (e) {
      logger.error(e);
    }
    return [];
  };

  await pMap(notParsed, processMessage, { concurrency: 100 });
  await batchChroma.flush();
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
      const queryResults = await semanticQuery({
        openAiKey,
        queryText: searchTerm,
      });

      return queryResults;
    } else {
      return await dbWorker.worker.fullTextMessageSearch(searchTerm, chatIds, handleIds, startDate, endDate);
    }
  },
);
