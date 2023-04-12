import { GPT4Tokenizer } from "gpt4-tokenizer";
import { PineconeClient } from "pinecone-client";
import { Configuration, OpenAIApi } from "openai";
import dbWorker from "./database-worker";
import { pRateLimit } from "p-ratelimit";
import { handleIpc } from "./ipc"; // TypeScript

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

export interface PostDetails {
  path: string;
  content: PostContent;
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

const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
export const MAX_INPUT_TOKENS = 200;

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

      const vector: SemanticSearchVector = {
        id: pendingVector.id,
        metadata: pendingVector.metadata,
        values: embed.data[0]?.embedding || [],
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
  let chunk = {
    tokens: [] as string[],
    start: 0,
    end: 0,
  };
  let start = 0;

  const { text } = tokenizer.encode(content);

  for (const word of text) {
    const newChunkTokens = [...chunk.tokens, word];
    if (newChunkTokens.length > maxInputTokens) {
      const text = chunk.tokens.join("");
      chunks.push({
        text,
        start,
        end: start + text.length,
      });
      start += text.length + 1;
      chunk = {
        tokens: [word],
        start,
        end: start,
      };
    } else {
      chunk = {
        ...chunk,
        tokens: newChunkTokens,
      };
    }
  }
  chunks.push({
    ...chunk,
    text: chunk.tokens.join(""),
  });

  return chunks;
};

export const createEmbeddings = async ({
  openAiKey,
  pineconeApiKey,
  pineconeBaseUrl,
  pineconeNamespace,
}: {
  openAiKey: string;
  pineconeApiKey: string;
  pineconeBaseUrl: string;
  pineconeNamespace: string;
}) => {
  const messages = await dbWorker.worker.getAllMessageTexts();
  const configuration = new Configuration({
    apiKey: openAiKey,
  });
  const openai = new OpenAIApi(configuration);
  const pinecone = new PineconeClient<SemanticSearchMetadata>({
    apiKey: pineconeApiKey,
    baseUrl: pineconeBaseUrl,
    namespace: pineconeNamespace,
  });

  // create a rate limiter that allows up to 30 API calls per second,
  // with max concurrency of 10
  const limit = pRateLimit({
    interval: 1000 * 60, // 1 minute
    rate: 3500, // 3500 calls per minute
    concurrency: 60, // no more than 60 running at once
  });

  const promises = messages.map(async (message) => {
    return limit(async () => {
      if (!message.text) {
        return;
      }
      const chunks = splitIntoChunks(message.text);
      const itemEmbeddings = await getEmbeddings({
        id: message.guid,
        content: { chunks },
        openai,
      });
      await pinecone.upsert({
        vectors: itemEmbeddings,
      });
    });
  });
  await Promise.all(promises);
};
export interface SemanticQueryOptions {
  /** Default: 10 */
  limit?: number;
  /** Default: false */
  includeValues?: boolean;
}
export async function semanticQuery(
  query: string,
  openai: OpenAIApi,
  pinecone: PineconeClient<SemanticSearchMetadata>,
  options?: SemanticQueryOptions,
) {
  const embed = (
    await openai.createEmbedding({
      input: query,
      model: OPENAI_EMBEDDING_MODEL,
    })
  ).data;

  if (!embed.data.length || !embed.data[0]) {
    throw new Error(`Error generating embedding for query: ${query}`);
  }

  const response = await pinecone.query({
    vector: embed.data[0].embedding,
    topK: options?.limit ?? 10,
    includeMetadata: true,
    includeValues: options?.includeValues ?? false,
  });

  return response;
}

handleIpc("createEmbeddings", async ({ openAiKey: key, pineconeApiKey, pineconeNamespace, pineconeBaseUrl }) => {
  return await createEmbeddings({
    openAiKey: key,
    pineconeApiKey,
    pineconeNamespace,
    pineconeBaseUrl,
  });
});
