import { getSemanticTokenizer } from "./tokenizer";

const EMBEDDING_PRICE_PER_MILLION_TOKENS = 0.1;

export const getStatsForText = async (text: string[]) => {
  let totalTokens = 0;
  const uniqueText = new Set<string>();
  for (const line of text) {
    if (line) {
      uniqueText.add(line);
    }
  }
  if (uniqueText.size) {
    const tokenizer = await getSemanticTokenizer();
    for (const line of uniqueText) {
      totalTokens += tokenizer.estimateTokenCount(line);
    }
  }

  const totalMessages = uniqueText.size;
  const estimatedTimeRpm = totalMessages / 3500 / 10; // we batch so divide it by a heuristic i eyeballed
  const estimatedTimeTpm = totalTokens / 350000 / 10;
  const estimatedTime = Math.max(estimatedTimeRpm, estimatedTimeTpm);
  return {
    totalMessages,
    totalTokens,
    averageTokensPerLine: totalMessages ? totalTokens / totalMessages : 0,
    estimatedPrice: (totalTokens / 1_000_000) * EMBEDDING_PRICE_PER_MILLION_TOKENS,
    // openai ratelimiter is
    // 3,500 RPM
    // 350,000 TPM
    estimatedTimeMin: estimatedTime,
  };
};
