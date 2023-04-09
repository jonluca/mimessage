import type { SQLDatabase } from "../../electron-src/data/database";
import type { Contact } from "node-mac-contacts";

export type ChatList = NonNullable<Awaited<ReturnType<SQLDatabase["getChatList"]>>>;
export type WrappedStats = NonNullable<Awaited<ReturnType<SQLDatabase["calculateWrappedStats"]>>>;
export type MessagesForChat = NonNullable<Awaited<ReturnType<SQLDatabase["getMessagesForChatId"]>>>;
export type Message = MessagesForChat[number];
export type LatestMessagesForEachChat = NonNullable<Awaited<ReturnType<SQLDatabase["getLatestMessageForEachChat"]>>>;
export type LatestMessage = LatestMessagesForEachChat[number];
export type Chat = ChatList[number];
export type Handle = ChatList[number]["handles"][number];
export type Contacts = Contact[];
