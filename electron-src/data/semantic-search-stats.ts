import { GPT4Tokenizer } from "gpt4-tokenizer";

const tokenizer = new GPT4Tokenizer({ type: "gpt3" });

export const getStatsForText = (text: { text: string | null }[]) => {
  let totalTokens = 0;
  for (const line of text) {
    if (line.text) {
      const tokens = tokenizer.estimateTokenCount(line.text);
      totalTokens += tokens;
    }
  }

  const totalMessages = text.length;
  const estimatedTimeRpm = totalMessages / 3500;
  const estimatedTimeTpm = totalTokens / 350000;
  const estimatedTime = Math.max(estimatedTimeRpm, estimatedTimeTpm);
  return {
    totalMessages,
    totalTokens,
    averageTokensPerLine: totalTokens / totalMessages,
    estimatedPrice: (totalTokens / 1000) * 0.0004, // dollars
    // openai ratelimiter is
    // 3,500 RPM
    // 350,000 TPM
    estimatedTimeMin: estimatedTime, // we can make 60 requests per minute, so we'll estimate 1 request per second
  };
};