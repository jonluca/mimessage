import { Configuration, OpenAIApi } from "openai";
import { GPT4Tokenizer } from "gpt4-tokenizer";
import axios from "axios";
import type { ChatCompletionRequestMessage } from "openai/api";
import type { ChatList, MessagesForChat } from "../interfaces";
import type { AiMessage } from "../context";
import { useMimessage } from "../context";

interface InitialPromptForFile {
  lastInteracted: Date;
  name: string;
  relation: string;
}

class OpenAIClient {
  openai: OpenAIApi | null = null;
  encoder: GPT4Tokenizer;
  configuration: Configuration | null = null;

  constructor() {
    this.setConfiguration();
    this.encoder = new GPT4Tokenizer({ type: "gpt3" }); // or 'codex'
  }

  setConfiguration = () => {
    const key = process.env.OPENAI_API_KEY || useMimessage.getState().openAiKey || "";
    if (key) {
      this.configuration = new Configuration({
        apiKey: key,
      });
      this.openai = new OpenAIApi(this.configuration);
    }
  };

  MESSAGE_TOKEN_LIMIT = 4096;
  private getInitialPromptForFile = (
    metadata: InitialPromptForFile,
    previousHistory: MessagesForChat,
    newMessage: ChatCompletionRequestMessage,
  ): string => {
    const messageHistory = previousHistory.map((m) => {
      return `**${m.is_from_me ? "Them" : "You"}**: ${m.text}\n`;
    });
    let tokens = 0;
    let historyPrompt = ``;
    while (tokens < this.MESSAGE_TOKEN_LIMIT && messageHistory.length > 0) {
      const message = messageHistory.pop()!;
      historyPrompt = `${message}${historyPrompt}`;
      tokens += this.checkPromptLength(message);
    }
    return `You are ${metadata.name}, the ${
      metadata.relation
    } of the person you're talking to. You haven't spoken since ${metadata.lastInteracted.toDateString()}. Do NOT break character. Do NOT mention that you are an AI. If you can't do something, respond in the voice of the person you are pretending to be - under no circumstance should you say you are an AI. You should provide emotional and friendly support, and continue the conversation at all costs. You should reply in the same voice and style, based on their historical voice. Please match the use of punctuation and tone/style of communicating. Here are some examples of messages that have been sent that you should learn from:\n\n${historyPrompt}\n\n**Them**: ${
      newMessage.content
    }\n**You**:`;
  };

  private checkPromptLength = (prompt: string): number => {
    const encoded = this.encoder.encode(prompt);
    return encoded.length;
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
      relation: useMimessage.getState().relation,
    };
    // remove all non-printable chars, and trim

    const latestMessages = previousHistory
      .slice(-100)
      .filter((l) => (l.text || "").replace(/[\u{FFFC}-\u{FFFD}]/gu, "").trim());
    const initialContent = this.getInitialPromptForFile(metadata, latestMessages, newMessage);
    const prompts: ChatCompletionRequestMessage[] = [
      { content: initialContent, role: "system" },
      ...latestMessages.map(
        (m) => ({ content: m.text, role: m.is_from_me ? "user" : "assistant" } as ChatCompletionRequestMessage),
      ),
      ...existingAiMessages.flatMap(
        (m) =>
          [Boolean(m.content) && { content: m.content, role: m.role }].filter(
            Boolean,
          ) as ChatCompletionRequestMessage[],
      ),
      { content: newMessage.content, role: newMessage.role },
    ];
    return prompts;
  };
  runCompletion = async (
    messages: Array<ChatCompletionRequestMessage>,
  ): Promise<ChatCompletionRequestMessage | undefined | null> => {
    try {
      this.setConfiguration();
      if (!this.openai) {
        return null;
      }
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
