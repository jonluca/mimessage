import OpenAI from "openai";
import { GPT4Tokenizer } from "gpt4-tokenizer";
import type { ChatList, MessagesForChat } from "../interfaces";
import type { AiMessage } from "../context";
import { useMimessage } from "../context";

interface InitialPromptForFile {
  instructions: string;
  lastInteracted: Date;
  name: string;
  relation: string;
}

class OpenAIClient {
  openai: OpenAI | null = null;
  encoder: GPT4Tokenizer;
  private configuredKey: string | null = null;

  constructor() {
    this.encoder = new GPT4Tokenizer({ type: "gpt3" }); // or 'codex'
    this.setConfiguration();
  }

  setConfiguration = () => {
    const key = useMimessage.getState().openAiKey?.trim() || "";
    if (!key) {
      this.openai = null;
      this.configuredKey = null;
      return;
    }
    if (this.openai && this.configuredKey === key) {
      return;
    }
    this.openai = new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    this.configuredKey = key;
  };

  MESSAGE_TOKEN_LIMIT = 4096;
  private getInitialPromptForFile = (metadata: InitialPromptForFile): string => {
    const basePrompt = `You are ${metadata.name}, the ${
      metadata.relation
    } of the person you're talking to. You haven't spoken since ${metadata.lastInteracted.toDateString()}. Do NOT break character. Do NOT mention that you are an AI. If you can't do something, respond in the voice of the person you are pretending to be. You should provide emotional and friendly support. Reply in the same voice and style as the historical messages, including their punctuation and tone.`;
    return metadata.instructions ? `${basePrompt}\n\nAdditional style guidance: ${metadata.instructions}` : basePrompt;
  };

  private checkPromptLength = (prompt: string): number => {
    const encoded = this.encoder.encode(prompt);
    return encoded.length;
  };

  generatePrompts = (
    newMessage: AiMessage,
    existingAiMessages: Array<AiMessage>,
    previousHistory: MessagesForChat,
    chat: ChatList[number],
  ) => {
    const lastMessageSent = previousHistory[previousHistory.length - 1];
    const firstHandle = chat.handles[0];
    const settings = useMimessage.getState();
    const metadata = {
      instructions: settings.aiPersonaInstructions.trim().slice(0, 2000),
      lastInteracted: lastMessageSent?.date_obj || new Date(),
      name: firstHandle?.contact?.parsedName || firstHandle?.id || chat.name || "the other person",
      relation: settings.relation,
    };
    const history = previousHistory
      .slice(-100)
      .filter((message) => (message.text || "").replace(/[\u{FFFC}-\u{FFFD}]/gu, "").trim());
    const initialContent = this.getInitialPromptForFile(metadata);
    const historyMessages: OpenAI.ChatCompletionMessageParam[] = [
      ...history.map((message) => ({
        content: message.text ?? "",
        role: message.is_from_me ? ("user" as const) : ("assistant" as const),
      })),
      ...existingAiMessages.flatMap((message) =>
        message.content && !message.pending ? [{ content: message.content, role: message.role }] : [],
      ),
    ];
    const newestHistory: OpenAI.ChatCompletionMessageParam[] = [];
    let tokens = this.checkPromptLength(initialContent) + this.checkPromptLength(newMessage.content);
    while (historyMessages.length) {
      const message = historyMessages.pop()!;
      const messageTokens = this.checkPromptLength(typeof message.content === "string" ? message.content : "");
      if (tokens + messageTokens > this.MESSAGE_TOKEN_LIMIT) {
        break;
      }
      tokens += messageTokens;
      newestHistory.unshift(message);
    }
    const prompts: OpenAI.ChatCompletionMessageParam[] = [
      { content: initialContent, role: "system" },
      ...newestHistory,
      { content: newMessage.content, role: newMessage.role },
    ];
    return prompts;
  };
  runCompletion = async (
    messages: Array<OpenAI.ChatCompletionMessageParam>,
  ): Promise<Pick<AiMessage, "content" | "role"> | null> => {
    try {
      this.setConfiguration();
      if (!this.openai) {
        return null;
      }
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages,
      });
      const message = completion.choices[0]?.message;
      if (!message) {
        return null;
      }
      const content = message.content ?? message.refusal;
      if (!content?.trim()) {
        return null;
      }
      return {
        content,
        role: "assistant",
      };
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        console.error(e.status);
        console.error(e.error);
      } else {
        console.error(e);
      }
      return null;
    }
  };
}

export const openAIClient = new OpenAIClient();
export default openAIClient;
