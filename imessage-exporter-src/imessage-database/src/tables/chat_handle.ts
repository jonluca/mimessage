import { Connection, Database, ErrorCode, ErrorInstance, Row, Statement } from "better-sqlite3";
import { Cacheable, Deduplicate, Diagnostic, Table } from "../tables/table";
import { processing, doneProcessing } from "../util/output";

export class ChatToHandle implements Table, Cacheable<ChatToHandle, number, Map<number, Set<number>>>, Deduplicate<ChatToHandle, Set<number>>, Diagnostic {
    chat_id: number;
    handle_id: number;

    static fromRow(row: Row): ChatToHandle {
        return new ChatToHandle(
            row.get("chat_id"),
            row.get("handle_id")
        );
    }

    static get(db: Connection): Statement {
        const getStmt = `SELECT * FROM chat_handle_join`;
        try {
            return db.prepare(getStmt);
        } catch (error) {
            throw new ErrorInstance("ChatToHandle", ErrorCode.ChatToHandle);               
        }
    }

    static extract(chatToHandle: ChatToHandle): ChatToHandle {
        return chatToHandle;
    }

    cache(db: Connection): Map<number, Set<number>> {
        const cache: Map<number, Set<number>> = new Map();

        const rows = ChatToHandle.get(db);
        const mappings = rows.iterate([]);

        for (const chatToHandleRow of mappings) {
            const joiner = ChatToHandle.extract(chatToHandleRow);
            const existingHandles = cache.get(joiner.chat_id);
            if (existingHandles) {
                existingHandles.add(joiner.handle_id);
            }
            else {
                const newDataToCache = new Set();
                newDataToCache.add(joiner.handle_id);
                cache.set(joiner.chat_id, newDataToCache);
            }
        }

        return cache;
    }

    dedupe(duplicatedData: Map<number, Set<number>>): Map<number, number> {
        const deduplicatedChats: Map<number, number> = new Map();
        const participantsToUniqueChatId: Map<Set<number>, number> = new Map();

        let uniqueChatIdentifier = 0;
        duplicatedData.forEach((participants, chatId) => {
            const id = participantsToUniqueChatId.get(participants);
            if (id !== undefined) {
                deduplicatedChats.set(chatId, id);
            } else {
                participantsToUniqueChatId.set(participants, uniqueChatIdentifier);
                deduplicatedChats.set(chatId, uniqueChatIdentifier);
                uniqueChatIdentifier += 1;
            }
        });

        return deduplicatedChats;
    }

    runDiagnostic(db: Connection): void {
        processing();

        const statementMessageChats = db.prepare(`SELECT DISTINCT chat_id from chat_message_join`);
        const statementMessageChatRows = statementMessageChats.iterate([]);
        const uniqueChatsFromMessages: Set<number> = new Set();
        statementMessageChatRows.forEach(row => {
            uniqueChatsFromMessages.add(row.get<number>(0));
        });

        const statementHandleChats = db.prepare(`SELECT DISTINCT chat_id from chat_handle_join`);
        const statementHandleChatRows = statementHandleChats.iterate([]);
        const uniqueChatsFromHandles: Set<number> = new Set();
        statementHandleChatRows.forEach(row => {
            uniqueChatsFromHandles.add(row.get<number>(0));
        });

        doneProcessing();

        const chatsWithNoHandles = new Set([...uniqueChatsFromMessages].filter(x => !uniqueChatsFromHandles.has(x))).size;
        if (chatsWithNoHandles > 0) {
            console.log(`Chats with no handles: ${chatsWithNoHandles}`);
        }
    }
}