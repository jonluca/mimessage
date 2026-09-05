import { contextBridge, ipcRenderer } from "electron";

if (process.argv.includes("--mimessage-native-liquid-glass")) {
  const markNativeLiquidGlass = () => {
    if (!document.documentElement) {
      return false;
    }
    document.documentElement.classList.add("native-liquid-glass");
    return true;
  };
  if (!markNativeLiquidGlass()) {
    window.addEventListener("DOMContentLoaded", markNativeLiquidGlass, { once: true });
  }
}

const INVOKE_CHANNELS = new Set([
  "calculateSemanticSearchStatsEnhanced",
  "calculateSlowWrappedStats",
  "calculateWrappedStats",
  "broadcastPreferences",
  "checkPermissions",
  "contacts",
  "copyLocalDb",
  "createEmbeddings",
  "doesLocalDbCopyExist",
  "embeddingsCacheSize",
  "export",
  "fullDiskAccess",
  "getChatList",
  "getEarliestMessageDate",
  "getEmbeddingsCompleted",
  "getHomeDir",
  "getPinnedConversationIdentifiers",
  "getMessagesForChatId",
  "getMessagesPage",
  "globalSearch",
  "initialize",
  "isInitialized",
  "messageCount",
  "openFileAtFolder",
  "openPrivacySettings",
  "requestContactsPerms",
  "searchMessagesForChatId",
  "setSetupWindowMode",
  "skipContactsCheck",
  "showEmojiPanel",
  "showConversationDetailsEditMenu",
  "showConversationFilterMenu",
  "showFaceTimeMenu",
  "showMessageAppsMenu",
  "showSettings",
]);
const STORE_KEYS = new Set(["ai-persona-instructions", "ai-relation", "openai-key", "semanticSearch"]);

interface RendererIpc {
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
  on: (channel: string, listener: (...args: unknown[]) => void) => void;
}

interface Store {
  get: (key: string) => Promise<any>;
  delete: (key: string) => Promise<any>;
  has: (key: string) => Promise<boolean>;
  set: (key: string, val: any) => Promise<void>;
  // any other methods you've defined...
}
declare global {
  var ipcRenderer: RendererIpc;
  var store: Store;
}

const assertInvokeChannel = (channel: string) => {
  if (!INVOKE_CHANNELS.has(channel)) {
    throw new Error(`Unsupported IPC channel: ${channel}`);
  }
};

const assertStoreKey = (key: string) => {
  if (!STORE_KEYS.has(key)) {
    throw new Error(`Unsupported renderer setting: ${key}`);
  }
};

contextBridge.exposeInMainWorld("ipcRenderer", {
  invoke(channel: string, ...args: unknown[]) {
    assertInvokeChannel(channel);
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel: string, listener: (...args: unknown[]) => void) {
    if (
      channel !== "composeNewMessage" &&
      channel !== "openWrapped" &&
      channel !== "preferencesChanged" &&
      channel !== "refreshChats"
    ) {
      throw new Error(`Unsupported IPC event: ${channel}`);
    }
    ipcRenderer.on(channel, (_event, ...args) => listener(...args));
  },
} satisfies RendererIpc);

contextBridge.exposeInMainWorld("store", {
  get(key: string) {
    assertStoreKey(key);
    return ipcRenderer.invoke("electron-store-get", key);
  },
  has(key: string) {
    assertStoreKey(key);
    return ipcRenderer.invoke("electron-store-has", key);
  },
  delete(key: string) {
    assertStoreKey(key);
    return ipcRenderer.invoke("electron-store-delete", key);
  },
  set(key: string, value: unknown) {
    assertStoreKey(key);
    return ipcRenderer.invoke("electron-store-set", key, value);
  },
} satisfies Store);
