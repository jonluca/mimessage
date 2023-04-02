import type { SQLDatabase } from "../../electron-src/data/database";
import type { Contact } from "node-mac-contacts";

export type ChatList = NonNullable<Awaited<ReturnType<SQLDatabase["getChatList"]>>>;
export type Chat = ChatList[number];
export type Contacts = Contact[];
