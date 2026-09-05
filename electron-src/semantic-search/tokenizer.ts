import type { GPT4Tokenizer } from "gpt4-tokenizer";

let tokenizer: Promise<GPT4Tokenizer> | undefined;

export const getSemanticTokenizer = (): Promise<GPT4Tokenizer> => {
  // Loading the vocabulary and constructing the tokenizer is expensive. Most
  // launches only read messages, so defer both until semantic indexing needs it.
  tokenizer ??= import("gpt4-tokenizer").then(({ GPT4Tokenizer }) => new GPT4Tokenizer({ type: "gpt3" }));
  return tokenizer;
};
