import jetpack from "fs-jetpack";
import logger from "../utils/logger";
import { appMessagesDbCopy, messagesDb } from "../utils/constants";

export const copyLatestDb = async () => {
  await copyDbAtPath(messagesDb);
};
export const copyDbAtPath = async (path: string) => {
  if (!(await jetpack.existsAsync(path))) {
    throw new Error("Messages DB does not exist");
  }
  logger.info("Copying Messages DB");
  await jetpack.copyAsync(path, appMessagesDbCopy, { overwrite: true });
  logger.info("Messages DB copied");
};
export const localDbExists = async () => {
  return Boolean(await jetpack.existsAsync(appMessagesDbCopy));
};
