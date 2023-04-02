import { Database } from "sqlite3";
import * as path from "path";

export interface Table<T> {
    fromRow(row: any): Promise<T>;
    get(db: Database): Promise<Database.Iterator<T>>;
    extract(item: Promise<Database.ExecResult>): Promise<T>;
}

export interface Cacheable<K, V> {
    cache(db: Database): Promise<Map<K, V>>;
}

export interface Deduplicate<T> {
    dedupe(duplicatedData: Map<number, T>): Map<number, number>;
}

export interface Diagnostic {
    runDiagnostic(db: Database): void;
}

export async function get_connection(filePath: string): Promise<Database> {
    const isExisting = await path.exists(filePath);

    if (isExisting) {
        return new Promise((resolve, reject) => {
            const db = new Database(
                filePath,
                Database.OPEN_READONLY,
                (error) => {
                    if (error) {
                        reject(new Error(`Unable to read from chat database: ${error}\nEnsure full disk access is enabled for your terminal emulator in System Settings > Security and Privacy > Full Disk Access`));
                    } else {
                        resolve(db);
                    }
                }
            );
        });
    } else {
        throw new Error(`Database not found at ${filePath}`);
    }
}

// Table Names
export const HANDLE = "handle";
export const MESSAGE = "message";
export const CHAT = "chat";
export const ATTACHMENT = "attachment";
export const CHAT_MESSAGE_JOIN = "chat_message_join";
export const MESSAGE_ATTACHMENT_JOIN = "message_attachment_join";
export const CHAT_HANDLE_JOIN = "chat_handle_join";

// Column names
export const MESSAGE_PAYLOAD = "payload_data";
export const MESSAGE_SUMMARY_INFO = "message_summary_info";
export const ATTRIBUTED_BODY = "attributedBody";

// Default information
export const ME = "Me";
export const YOU = "You";
export const UNKNOWN = "Unknown";
export const DEFAULT_PATH = "Library/Messages/chat.db";
export const ORPHANED = "orphaned";
export const MAX_LENGTH = 240;
export const FITNESS_RECEIVER = "$(kIMTranscriptPluginBreadcrumbTextReceiverIdentifier)";
export const ATTACHMENTS_DIR = "attachments";
```