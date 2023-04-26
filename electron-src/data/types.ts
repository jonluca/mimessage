import type { SQLDatabase } from "./database";

export type MessageInfo = NonNullable<Awaited<ReturnType<SQLDatabase["getMessageInfoForEmbeddingDb"]>>>;
