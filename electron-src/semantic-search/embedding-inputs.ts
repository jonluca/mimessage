import type { GPT4Tokenizer } from "gpt4-tokenizer";
import type { PendingEmbedding } from "./batch-utils";

export const MAX_INPUT_TOKENS = 7000;

interface EmbeddingInput extends PendingEmbedding {
  chunkIndex: number;
  messageGuid: string;
  messageText: string;
}

export const getEmbeddingInputs = (
  records: { messageGuid: string; text: string }[],
  tokenizer: Pick<GPT4Tokenizer, "encode" | "decode">,
  maxInputTokens = MAX_INPUT_TOKENS,
): EmbeddingInput[] => {
  const chunksByText = new Map<string, PendingEmbedding[]>();
  return records.flatMap((record) => {
    let chunks = chunksByText.get(record.text);
    if (!chunks) {
      const encoded = tokenizer.encode(record.text);
      chunks = [];
      if (encoded.length <= maxInputTokens) {
        chunks.push({ input: record.text, tokenCount: encoded.length });
      } else {
        for (let index = 0; index < encoded.length; index += maxInputTokens) {
          const chunk = encoded.slice(index, index + maxInputTokens);
          chunks.push({ input: tokenizer.decode(chunk), tokenCount: chunk.length });
        }
      }
      // Repeated messages still need separate provenance, but only tokenize
      // their text once per page. Release the cache when the page is complete.
      chunksByText.set(record.text, chunks);
    }
    return chunks.map((chunk, chunkIndex) => ({
      ...chunk,
      chunkIndex,
      messageGuid: record.messageGuid,
      messageText: record.text,
    }));
  });
};
