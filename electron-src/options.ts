import ElectronStore from "electron-store";
import { safeStorage } from "electron";
import { handleIpc } from "./ipc/ipc";
import logger from "./utils/logger";
const store = new ElectronStore();
const AUTO_HIDE_SETTING_KEY = "autoHideMenuBar";
const SKIP_CONTACTS_PERMS_CHECK = "skipContactsPermsCheck";
export const shouldAutoHideMenu = () => !!store.get(AUTO_HIDE_SETTING_KEY);
export const shouldSkipContactsCheck = () => !!store.get(SKIP_CONTACTS_PERMS_CHECK);
export const setSkipContactsPermsCheck = () => store.set(SKIP_CONTACTS_PERMS_CHECK, true);
export const clearSkipContactsPermsCheck = () => store.delete(SKIP_CONTACTS_PERMS_CHECK);

const RENDERER_STORE_KEYS = new Set(["ai-persona-instructions", "ai-relation", "openai-key", "semanticSearch"]);
const ENCRYPTED_VALUE_PREFIX = "safe-storage:v1:";

const encryptOpenAiKey = (value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure API key storage is unavailable");
  }
  return `${ENCRYPTED_VALUE_PREFIX}${safeStorage.encryptString(value).toString("base64")}`;
};

const readOpenAiKey = () => {
  const stored = store.get("openai-key");
  if (typeof stored !== "string" || !stored) {
    return stored;
  }
  if (stored.startsWith(ENCRYPTED_VALUE_PREFIX)) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure API key storage is unavailable");
    }
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(ENCRYPTED_VALUE_PREFIX.length), "base64"));
    } catch (error) {
      logger.error(`Unable to decrypt the saved OpenAI key: ${String(error)}`);
      return undefined;
    }
  }

  // Migrate keys saved by older releases from plaintext ElectronStore data.
  if (safeStorage.isEncryptionAvailable()) {
    store.set("openai-key", encryptOpenAiKey(stored));
  }
  return stored;
};

function assertRendererStoreKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || !RENDERER_STORE_KEYS.has(key)) {
    throw new Error("Unsupported renderer setting");
  }
}

handleIpc("electron-store-get", (key: unknown) => {
  assertRendererStoreKey(key);
  if (key === "openai-key") {
    return readOpenAiKey();
  }
  return store.get(key);
});
handleIpc("electron-store-delete", (key: unknown) => {
  assertRendererStoreKey(key);
  return store.delete(key);
});

handleIpc("electron-store-has", (key: unknown) => {
  assertRendererStoreKey(key);
  return store.has(key);
});
handleIpc("electron-store-set", (key: unknown, value: unknown) => {
  assertRendererStoreKey(key);
  if (key === "openai-key" && typeof value !== "string") {
    throw new Error("OpenAI key must be a string");
  }
  if (key === "semanticSearch" && typeof value !== "boolean") {
    throw new Error("Semantic search setting must be a boolean");
  }
  if (key === "ai-relation" && (typeof value !== "string" || value.length > 64)) {
    throw new Error("AI relationship must be a short string");
  }
  if (key === "ai-persona-instructions" && (typeof value !== "string" || value.length > 2000)) {
    throw new Error("AI message instructions are invalid");
  }
  return store.set(key, key === "openai-key" ? encryptOpenAiKey(value as string) : value);
});
