import { GPT4Tokenizer } from "gpt4-tokenizer";

const tokenizer = new GPT4Tokenizer({ type: "gpt3" });

export const getStatsForText = (text: string[]) => {
  let totalTokens = 0;
  const uniqueText = new Set<string>();
  for (const line of text) {
    if (line && !uniqueText.has(line)) {
      uniqueText.add(line);
      const tokens = tokenizer.estimateTokenCount(line);
      totalTokens += tokens;
    }
  }

  const totalMessages = uniqueText.size;
  const estimatedTimeRpm = totalMessages / 3500 / 10; // we batch so divide it by a heuristic i eyeballed
  const estimatedTimeTpm = totalTokens / 350000 / 10;
  const estimatedTime = Math.max(estimatedTimeRpm, estimatedTimeTpm);
  return {
    totalMessages,
    totalTokens,
    averageTokensPerLine: totalTokens / totalMessages,
    estimatedPrice: (totalTokens / 1000) * 0.0004, // dollars
    // openai ratelimiter is
    // 3,500 RPM
    // 350,000 TPM
    estimatedTimeMin: estimatedTime,
  };
};
