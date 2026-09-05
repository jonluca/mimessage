export interface Embeddings {
  embedding: Buffer;
  model: string;
  text: string;
}

export interface EmbeddingSources {
  chunk_index: number;
  generation_id: string;
  message_guid: string;
  message_text: string;
  model: string;
  text: string;
}

export interface QueryEmbeddings {
  embedding: Buffer;
  last_used_at: number;
  model: string;
  query_text: string;
}

export interface SemanticIndexState {
  active_generation_id: string | null;
  active_model: string | null;
  active_snapshot_id: string | null;
  id: number;
}

export interface DB {
  embedding_sources: EmbeddingSources;
  embeddings: Embeddings;
  query_embeddings: QueryEmbeddings;
  semantic_index_state: SemanticIndexState;
}
