export interface Embeddings {
  text: string;
  embedding: Buffer;
}

export interface DB {
  embeddings: Embeddings;
}
