import OpenAI from "openai";
import dbWorker from "../workers/database-worker";
import { handleIpc } from "../ipc/ipc";
import logger from "../utils/logger";
import { BatchOpenAi, OPENAI_EMBEDDING_MODEL } from "./batch-utils";
import { getEmbeddingInputs } from "./embedding-inputs";
import { getSemanticTokenizer } from "./tokenizer";

export { MAX_INPUT_TOKENS } from "./embedding-inputs";
const PAGE_SIZE = 5_000;
const MAX_SEMANTIC_GUIDS = 10_000;

export interface EmbeddingsCreationProgress {
  completedRecords: number;
  status: "idle" | "running" | "complete" | "error";
  totalRecords: number;
}

let embeddingsProgress: EmbeddingsCreationProgress = {
  completedRecords: 0,
  status: "idle",
  totalRecords: 0,
};
let embeddingsJob: Promise<void> | null = null;

class SemanticSnapshotChangedError extends Error {
  constructor() {
    super("The Messages database changed while semantic embeddings were being created; please retry");
  }
}

const assertTextIndexSnapshot = async (expectedSnapshotId: string) => {
  const currentSnapshotId = await dbWorker.worker.getTextIndexSnapshotId();
  if (currentSnapshotId !== expectedSnapshotId) {
    throw new SemanticSnapshotChangedError();
  }
};

export const createEmbeddings = async ({ openAiKey }: { openAiKey: string }) => {
  if (embeddingsJob) {
    return embeddingsJob;
  }
  const key = openAiKey.trim();
  if (!key) {
    throw new Error("An OpenAI API key is required to create semantic-search embeddings");
  }
  embeddingsJob = createEmbeddingsInternal(key)
    .catch((error) => {
      embeddingsProgress = { ...embeddingsProgress, status: "error" };
      throw error;
    })
    .finally(() => {
      embeddingsJob = null;
    });
  return embeddingsJob;
};

const createEmbeddingsInternal = async (openAiKey: string) => {
  logger.info("Creating embeddings");
  await dbWorker.embeddingsWorker.initialize();
  const [snapshotId, messageCount] = await Promise.all([
    dbWorker.worker.getTextIndexSnapshotId(),
    dbWorker.worker.countAllMessageTextRecords(),
  ]);
  await assertTextIndexSnapshot(snapshotId);

  const [completedAlready, indexIsCurrent] = await Promise.all([
    dbWorker.embeddingsWorker.countCompletedMessages(snapshotId, OPENAI_EMBEDDING_MODEL),
    dbWorker.embeddingsWorker.isSemanticIndexCurrent(snapshotId, OPENAI_EMBEDDING_MODEL),
  ]);
  if (indexIsCurrent && completedAlready === messageCount) {
    embeddingsProgress = {
      completedRecords: messageCount,
      status: "complete",
      totalRecords: messageCount,
    };
    return;
  }

  embeddingsProgress = {
    completedRecords: 0,
    status: "running",
    totalRecords: messageCount,
  };

  const openai = new OpenAI({ apiKey: openAiKey });
  const batchOpenai = new BatchOpenAi(openai);
  const generationId = await dbWorker.embeddingsWorker.beginSourceGeneration(snapshotId, OPENAI_EMBEDDING_MODEL);

  try {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      await assertTextIndexSnapshot(snapshotId);
      const records = await dbWorker.worker.getAllMessageTextRecords(PAGE_SIZE, offset);
      await assertTextIndexSnapshot(snapshotId);
      if (!records.length) {
        break;
      }

      const chunks = getEmbeddingInputs(records, await getSemanticTokenizer());
      await dbWorker.embeddingsWorker.insertEmbeddingSources(
        generationId,
        OPENAI_EMBEDDING_MODEL,
        chunks.map((chunk) => ({
          chunkIndex: chunk.chunkIndex,
          messageGuid: chunk.messageGuid,
          messageText: chunk.messageText,
          text: chunk.input,
        })),
      );

      const uniqueChunks = [...new Map(chunks.map((chunk) => [chunk.input, chunk])).values()];
      const lookupStartedAt = performance.now();
      const existingText = await dbWorker.embeddingsWorker.getExistingText(
        uniqueChunks.map((chunk) => chunk.input),
        OPENAI_EMBEDDING_MODEL,
      );
      logger.info(`Got existing text in ${performance.now() - lookupStartedAt}ms`);
      const existing = new Set(existingText);
      await batchOpenai.addPendingVectors(uniqueChunks.filter((chunk) => !existing.has(chunk.input)));
      // Flush each source page before advancing record-based progress. Staged
      // mappings stay invisible until final promotion, but reported progress is
      // always backed by durable vectors.
      await batchOpenai.flush();
      await assertTextIndexSnapshot(snapshotId);

      embeddingsProgress = {
        completedRecords: Math.min(embeddingsProgress.completedRecords + records.length, messageCount),
        status: "running",
        totalRecords: messageCount,
      };
      logger.info(
        `Completed ${embeddingsProgress.completedRecords} of ${messageCount} (${Math.round(
          (embeddingsProgress.completedRecords / Math.max(messageCount, 1)) * 100,
        )}%)`,
      );
    }

    await batchOpenai.flush();
    await assertTextIndexSnapshot(snapshotId);
    await dbWorker.embeddingsWorker.promoteSourceGeneration(
      generationId,
      snapshotId,
      OPENAI_EMBEDDING_MODEL,
      messageCount,
    );
    await assertTextIndexSnapshot(snapshotId);
    embeddingsProgress = {
      completedRecords: messageCount,
      status: "complete",
      totalRecords: messageCount,
    };
    logger.info("Done creating embeddings");
  } catch (error) {
    try {
      await dbWorker.embeddingsWorker.discardSourceGeneration(generationId);
    } catch (discardError) {
      logger.error("Failed to discard an incomplete semantic-search generation");
      logger.error(discardError);
    }
    throw error;
  }
};

interface SemanticQueryOpts {
  allowedTexts?: string[];
  openAiKey: string;
  queryText: string;
  snapshotId: string;
}

export async function semanticQuery({ queryText, openAiKey, snapshotId, allowedTexts }: SemanticQueryOpts) {
  const cachedQuery = await dbWorker.embeddingsWorker.getQueryEmbedding(queryText, OPENAI_EMBEDDING_MODEL);
  const existingCorpusEmbedding = cachedQuery
    ? null
    : await dbWorker.embeddingsWorker.getEmbeddingByText(queryText, OPENAI_EMBEDDING_MODEL, snapshotId);
  let floatEmbedding = cachedQuery?.embedding || existingCorpusEmbedding?.embedding;

  if (!floatEmbedding) {
    const startedAt = performance.now();
    const openai = new OpenAI({ apiKey: openAiKey });
    const openAiResponse = await openai.embeddings.create({
      input: queryText,
      model: OPENAI_EMBEDDING_MODEL,
    });
    logger.info(`Got embedding from OpenAI in ${performance.now() - startedAt}ms`);
    const embedding = openAiResponse.data[0]?.embedding;
    if (!embedding) {
      return [];
    }
    await dbWorker.embeddingsWorker.putQueryEmbedding(queryText, OPENAI_EMBEDDING_MODEL, embedding);
    floatEmbedding = new Float32Array(embedding);
  }

  const startedAt = performance.now();
  const results = await dbWorker.embeddingsWorker.calculateSimilarity(floatEmbedding, "cosine", {
    allowedTexts,
    model: OPENAI_EMBEDDING_MODEL,
    snapshotId,
  });
  logger.info(`Calculated similarity in ${performance.now() - startedAt}ms`);
  return results;
}

handleIpc("createEmbeddings", async ({ openAiKey: openAiKey }) => {
  return await createEmbeddings({ openAiKey });
});

handleIpc("getEmbeddingsCompleted", async () => {
  return { ...embeddingsProgress };
});

handleIpc("calculateSemanticSearchStatsEnhanced", async () => {
  const stats = await dbWorker.worker.calculateSemanticSearchStats();
  const localDb = dbWorker.embeddingsWorker;
  try {
    const snapshotId = await dbWorker.worker.getTextIndexSnapshotId();
    await localDb.initialize();
    const count = await localDb.countCompletedMessages(snapshotId, OPENAI_EMBEDDING_MODEL);
    return { ...stats, completedAlready: count };
  } catch (error) {
    logger.error(error);
    return stats;
  }
});

handleIpc("messageCount", async () => {
  return await dbWorker.worker.countAllMessageTextRecords();
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
    if (!searchTerm) {
      return [];
    }
    if (!useSemanticSearch) {
      return await dbWorker.worker.globalSearchTextBased(searchTerm, chatIds, handleIds, startDate, endDate);
    }
    if (!openAiKey) {
      return [];
    }

    logger.info("Using semantic search");
    const snapshotId = await dbWorker.worker.getTextIndexSnapshotId();
    const hasFilters = Boolean(chatIds?.length || handleIds?.length || startDate || endDate);
    const allowedScope = hasFilters
      ? await dbWorker.worker.getMessageTextScopeForFilters(chatIds, handleIds, startDate, endDate)
      : undefined;
    await assertTextIndexSnapshot(snapshotId);
    if (!(await dbWorker.embeddingsWorker.isSemanticIndexCurrent(snapshotId, OPENAI_EMBEDDING_MODEL))) {
      throw new Error("Set up semantic search in Settings for the current Messages library, or use text search.");
    }

    const startedAt = performance.now();
    const messageTexts = await semanticQuery({
      allowedTexts: allowedScope?.texts,
      openAiKey,
      queryText: searchTerm,
      snapshotId,
    });
    await assertTextIndexSnapshot(snapshotId);
    logger.info(`Got ${messageTexts.length} results in ${performance.now() - startedAt}ms`);

    const guids = await dbWorker.embeddingsWorker.getMessageGuidsForText(
      messageTexts,
      snapshotId,
      MAX_SEMANTIC_GUIDS,
      allowedScope?.messageGuids,
    );
    await assertTextIndexSnapshot(snapshotId);
    logger.info(`Got ${guids.length} guids from text`);
    return await dbWorker.worker.fullTextMessageSearchWithGuids(
      guids,
      searchTerm,
      chatIds,
      handleIds,
      startDate,
      endDate,
    );
  },
);
