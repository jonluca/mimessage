import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface MessageIdJoin {
  ROWID: Generated<number>;
  embedding_id: number | null;
  message_id: number | null;
  chat_id: number | null;
  handle_id: number | null;
  message_date: Generated<number | null>;
}

export interface TextEmbeddings {
  ROWID: Generated<number>;
  text: string;
  embedding: Buffer;
}

export interface DB {
  message_id_join: MessageIdJoin;
  text_embeddings: TextEmbeddings;
}
