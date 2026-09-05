import type { SQLDatabase } from "../../electron-src/data/database";
import type { Contact } from "electron-mac-contacts";

export type ChatList = NonNullable<Awaited<ReturnType<SQLDatabase["getChatList"]>>>;
export type WrappedStats = NonNullable<Awaited<ReturnType<SQLDatabase["calculateWrappedStats"]>>>;
export type WrappedChartStats = WrappedStats["chartStats"];
export type SlowWrappedStats = NonNullable<Awaited<ReturnType<SQLDatabase["calculateSlowWrappedStats"]>>>;
export type MessagesForChat = NonNullable<Awaited<ReturnType<SQLDatabase["getMessagesForChatId"]>>>;
export type MessagesPage = Awaited<ReturnType<SQLDatabase["getMessagesPage"]>>;
export type MessagePageBoundaryContext = NonNullable<MessagesPage["oldestPredecessor"]>;
export type MessagePageOptions = NonNullable<Parameters<SQLDatabase["getMessagesPage"]>[1]>;
export type ThreadMessageSearch = Awaited<ReturnType<SQLDatabase["searchMessagesForChatId"]>>;
export type GlobalSearchResponse = NonNullable<Awaited<ReturnType<SQLDatabase["fullTextMessageSearchWithGuids"]>>>;
export type SemanticSearchStats = NonNullable<Awaited<ReturnType<SQLDatabase["calculateSemanticSearchStats"]>>> & {
  completedAlready?: number;
};
export type GlobalSearchResult = GlobalSearchResponse[number];
export type Message = MessagesForChat[number];
export type Chat = ChatList[number];
export type Handle = ChatList[number]["handles"][number];
export type Contacts = Contact[];
