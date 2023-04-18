import { BatchMilvus } from "./batch-utils";

export const getMilvusClient = async () => {
  try {
    const milvus = new BatchMilvus();
    return milvus;
  } catch (e) {
    return null;
  }
};
