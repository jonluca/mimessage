import { GPT4Tokenizer } from "gpt4-tokenizer";

export const getStatsForText = (text: { text: string }[]) => {
  const tokenizer = new GPT4Tokenizer({ type: "gpt3" });
  let totalTokens = 0;
  for (const line of text) {
    const tokens = tokenizer.estimateTokenCount(line.text);
    totalTokens += tokens;
  }

  return {
    totalMessages: text.length,
    totalTokens,
    averageTokensPerLine: totalTokens / text.length,
    estimatedPrice: (totalTokens / 1000) * 0.0004, // dollars
    estimatedTimeMs: totalTokens * 0.000001,
  };
};
