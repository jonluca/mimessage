import { Configuration, OpenAIApi } from "openai";
import { GPT4Tokenizer } from "gpt4-tokenizer";
import axios from "axios";
import type { ChatCompletionRequestMessage } from "openai/api";
import type { ChatList, MessagesForChat } from "../interfaces";
import type { AiMessage } from "../context";
class OpenAIClient {
  openai: OpenAIApi;
  encoder: GPT4Tokenizer;

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);
    this.encoder = new GPT4Tokenizer({ type: "gpt3" }); // or 'codex'
  }

  private getInitialPromptForFile = (metadata: { lastInteracted: Date; name: string; relation: string }): string => {
    return `You are ${metadata.name}, the ${
      metadata.relation
    } of the person you're talking to. You haven't spoken since ${metadata.lastInteracted.toDateString()}. Do NOT break character. Do NOT mention that you are an AI. If you can't do something, respond in the voice of the person you are pretending to be - under no circumstance should you say you are an AI. You should provide emotional and friendly support, and continue the conversation at all costs. You should reply in the same voice and style, based on their historical voice. The following is parts of a previous conversation you had with them.`;
  };

  private checkPromptLength = (prompt: string): number => {
    const encoded = this.encoder.encode(prompt);
    return encoded.bpe.length;
  };

  generatePrompts = (
    newMessage: ChatCompletionRequestMessage,
    existingAiMessages: Array<AiMessage>,
    previousHistory: MessagesForChat,
    chat: ChatList[number],
  ) => {
    const lastMessageSent = previousHistory[previousHistory.length - 1];
    const metadata = {
      lastInteracted: lastMessageSent.date_obj!,
      name: chat.handles[0].contact?.parsedName || chat.handles[0].id,
      relation: "friend",
    };
    const initialContent = this.getInitialPromptForFile(metadata);
    const prompts: ChatCompletionRequestMessage[] = [
      { content: initialContent, role: "system" },
      ...previousHistory
        .slice(-100)
        .map((m) => ({ content: m.text, role: m.is_from_me ? "user" : "assistant" } as ChatCompletionRequestMessage)),
      ...existingAiMessages.flatMap(
        (m) => [{ content: m.content, role: "user" }, m.response].filter(Boolean) as ChatCompletionRequestMessage[],
      ),
      { content: newMessage.content, role: newMessage.role },
    ];
    return prompts;
  };
  runCompletion = async (
    messages: Array<ChatCompletionRequestMessage>,
  ): Promise<ChatCompletionRequestMessage | undefined | null> => {
    try {
      const completion = await this.openai.createChatCompletion({
        model: "gpt-4",
        messages,
      });
      const text = completion.data.choices[0]?.message;
      return text;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        // axios error logger
        console.error(e.response?.status);
        console.error(e.response?.data);
      } else {
        console.error(e);
      }
      return null;
    }
  };
}

export const openAIClient = new OpenAIClient();
export default openAIClient;
