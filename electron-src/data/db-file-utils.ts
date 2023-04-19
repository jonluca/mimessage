import jetpack from "fs-jetpack";
import logger from "../utils/logger";
import { appMessagesDbCopy, messagesDb } from "../utils/constants";
import childProcess from "child_process";

const exec = childProcess.exec;
export const copyLatestDb = async () => {
  logger.info("Killing iMessage if it's running");
  try {
    exec("pkill -f Messages");
    // wait 500ms for iMessage to close
    await new Promise((resolve) => setTimeout(resolve, 500));
    logger.info("iMessage killed");
  } catch (e) {
    logger.info("iMessage was not running");
  }
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
