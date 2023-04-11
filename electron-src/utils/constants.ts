import os from "os";
import path from "path";
import { appPath } from "../versions";

export const messagesDb = os.homedir() + "/Library/Messages/chat.db";
export const appMessagesDbCopy = path.join(os.homedir(), "Library", "Application Support", appPath, "db.sqlite");
