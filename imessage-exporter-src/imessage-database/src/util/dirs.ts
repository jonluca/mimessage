import { join } from "path";
import { homedir } from "os";

const DEFAULT_PATH = "/Library/Messages/chat.db";

/**
 * Get the user's home directory (MacOS only)
 */
export function home(): string {
  return homedir();
}

/**
 * Get the default path the iMessage database is located at
 */
export function defaultDbPath(): string {
  return join(home(), DEFAULT_PATH);
}