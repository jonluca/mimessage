import type { SQLDatabase } from "../../electron-src/data/database";
import type { Contact } from "electron-mac-contacts";

export type ChatList = NonNullable<Awaited<ReturnType<SQLDatabase["getChatList"]>>>;
export type WrappedStats = NonNullable<Awaited<ReturnType<SQLDatabase["calculateWrappedStats"]>>>;
export type SlowWrappedStats = NonNullable<Awaited<ReturnType<SQLDatabase["calculateSlowWrappedStats"]>>>;
export type MessageDates = NonNullable<Awaited<ReturnType<SQLDatabase["getMessageDates"]>>>;
export type MessagesForChat = NonNullable<Awaited<ReturnType<SQLDatabase["getMessagesForChatId"]>>>;
export type GlobalSearchResponse = NonNullable<Awaited<ReturnType<SQLDatabase["fullTextMessageSearch"]>>>;
export type SemanticSearchStats = NonNullable<Awaited<ReturnType<SQLDatabase["calculateSemanticSearchStats"]>>> & {
  completedAlready?: number;
};
export type GlobalSearchResult = GlobalSearchResponse[number];
export type Message = MessagesForChat[number];
export type Chat = ChatList[number];
export type MessageDate = MessageDates[number];
export type Handle = ChatList[number]["handles"][number];
export type Contacts = Contact[];
