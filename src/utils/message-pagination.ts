import type { AiMessage } from "../context";
import type { Message, MessagePageOptions, MessagesPage } from "../interfaces";

export interface DividerMessage {
  divider: true;
}

export type TranscriptItem = Message | DividerMessage | AiMessage;

export const MESSAGE_VIRTUAL_INDEX_BASE = 1_000_000;

export const getLocalMessageIndex = (virtualIndex: number, firstItemIndex: number) => virtualIndex - firstItemIndex;

const getStoredMessageKey = (message: Message) => message.message_id ?? message.guid;

export const mergeMessagePages = (pages: MessagesPage[]): Message[] => {
  const seen = new Set<number | string>();
  const messages: Message[] = [];
  for (const page of pages) {
    for (const message of page.messages) {
      const key = getStoredMessageKey(message);
      if (key === null || seen.has(key)) {
        continue;
      }
      seen.add(key);
      messages.push(message);
    }
  }
  return messages;
};

export const getPrependedMessageCount = (pages: MessagesPage[], pageParams: MessagePageOptions[]) => {
  const initialPageIndex = pageParams.findIndex((pageParam) => !pageParam.direction);
  if (initialPageIndex <= 0) {
    return 0;
  }

  const initialMessage = pages[initialPageIndex]?.messages[0];
  if (!initialMessage) {
    return mergeMessagePages(pages.slice(0, initialPageIndex)).length;
  }
  const initialKey = getStoredMessageKey(initialMessage);
  return Math.max(
    0,
    mergeMessagePages(pages).findIndex((message) => getStoredMessageKey(message) === initialKey),
  );
};

export const getTranscriptItemKey = (index: number, item: TranscriptItem) => {
  if ("divider" in item) {
    return "ai-conversation-divider";
  }
  if ("role" in item) {
    const identity = item.requestId || item.date.getTime();
    return `ai:${identity}:${item.role}:${item.requestId ? "" : index}`;
  }
  return `message:${item.message_id ?? item.guid ?? index}`;
};
