import { Database, Statement, RunResult } from "better-sqlite3";

interface Chat {
    rowid: number;
    chat_identifier: string;
    service_name: string;
    display_name?: string;
}

function fromRow(row: any): Chat {
    return {
        rowid: row.rowid,
        chat_identifier: row.chat_identifier,
        service_name: row.service_name,
        display_name: row.display_name ?? undefined,
    };
}

function get(db: Database): Statement {
    const stmt = db.prepare("SELECT * from chat");
    return stmt;
}

function extract(chatResult: Chat | any): Chat {
    if (chatResult instanceof Error) {
        throw chatResult;
    } else {
        return chatResult;
    }
}

function cache(db: Database): Map<number, Chat> {
    const map = new Map<number, Chat>();

    const stmt = get(db);

    const chats = stmt.iterate();

    for (const row of chats) {
        const chat = extract(fromRow(row));
        map.set(chat.rowid, chat);
    }
    return map;
}

function name(chat: Chat): string {
    return chat.display_name ?? chat.chat_identifier;
}

function displayName(chat: Chat): string | undefined {
    if (chat.display_name?.length) {
        return chat.display_name;
    }
    return undefined;
}