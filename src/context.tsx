import { create } from "zustand";
import type { Chat, ChatList } from "./interfaces";
import { useChatById } from "./hooks/dataHooks";
import type { Message } from "./interfaces";
import type { Contact } from "electron-mac-contacts";

export interface AiMessage {
  content: string;
  date: Date;
  errored?: true;
  pending?: boolean;
  requestId?: string;
  role: "assistant" | "user";
}

type ExtendedConversations = Record<number, AiMessage[]>;
export const WRAPPED_ALL_TIME_YEAR = 0;
type MaybeDate = Date | undefined | null;

export interface AppContext {
  // general state
  chatId: number | null;
  setChatId: (updated: number | null) => void;
  isComposingNewMessage: boolean;
  setIsComposingNewMessage: (updated: boolean) => void;
  highlightedMessage: Message | null;
  setHighlightedMessage: (updated: Message | null) => void;
  settingsOpen: boolean;
  setSettingsOpen: (updated: boolean) => void;
  // open ai
  relation: string;
  setRelation: (updated: string) => void;
  aiPersonaInstructions: string;
  setAiPersonaInstructions: (updated: string) => void;
  openAiKey: string | null;
  openAiKeyRevision: number;
  setOpenAiKey: (key: string | null) => void;
  extendedConversations: ExtendedConversations;
  updateConversation: (chatId: number, updater: (current: AiMessage[]) => AiMessage[]) => void;
  // wrapped
  isInWrapped: boolean;
  setIsInWrapped: (entry: boolean) => void;
  wrappedYear: number;
  setWrappedYear: (year: number) => void;
  // global search
  globalSearch: string | null;
  setGlobalSearch: (updated: string | null) => void;
  messageIdToBringToFocus: number | null;
  setMessageIdToBringToFocus: (updated: number | null) => void;
  selectedSearchMessageId: number | null;
  setSelectedSearchMessageId: (updated: number | null) => void;
  startDate: MaybeDate;
  setStartDate: (updated: MaybeDate) => void;
  endDate: MaybeDate;
  setEndDate: (updated: MaybeDate) => void;
  contactFilter: Contact[];
  setContactFilter: (updated: Contact[]) => void;
  chatFilter: ChatList;
  setChatFilter: (updated: ChatList) => void;
  useSemanticSearch: boolean;
  setUseSemanticSearch: (updated: boolean) => void;
  // message filter
  filter: string | null;
  setFilter: (updated: string | null) => void;
  regexSearch: boolean;
  setRegexSearch: (updated: boolean) => void;
  // chat search
  search: string | null;
  setSearch: (updated: string | null) => void;
}
export const openAiLocalStorageKey = "openai-key";
export const semanticSearchStorageKey = "semanticSearch";
export const relationStorageKey = "ai-relation";
export const aiPersonaStorageKey = "ai-persona-instructions";
let aiPersonaPersistenceTimer: ReturnType<typeof setTimeout> | undefined;
const useMimessage = create<AppContext>((set) => ({
  settingsOpen: false,
  setSettingsOpen: (settingsOpen: boolean) => set({ settingsOpen }),
  search: null,
  contactFilter: [],
  chatFilter: [],
  setContactFilter: (contactFilter: Contact[]) => set({ contactFilter }),
  setChatFilter: (chatFilter: ChatList) => set({ chatFilter }),
  filter: null,
  messageIdToBringToFocus: null,
  selectedSearchMessageId: null,
  useSemanticSearch: false,
  setUseSemanticSearch: (useSemanticSearch: boolean) => {
    void global.store
      .set(semanticSearchStorageKey, useSemanticSearch)
      .catch((error) => console.error("Unable to persist the semantic-search setting", error));
    return set({ useSemanticSearch });
  },
  globalSearch: null,
  regexSearch: false,
  isInWrapped: false,
  setIsInWrapped: (isInWrapped: boolean) => set({ isInWrapped }),
  setRegexSearch: (regexSearch: boolean) => set({ regexSearch }),
  setSearch: (search: string | null) => set({ search }),
  setFilter: (filter: string | null) => set({ filter }),
  setGlobalSearch: (globalSearch: string | null) => set({ globalSearch }),
  aiPersonaInstructions: "",
  setAiPersonaInstructions: (aiPersonaInstructions: string) => {
    clearTimeout(aiPersonaPersistenceTimer);
    aiPersonaPersistenceTimer = setTimeout(() => {
      void global.store
        .set(aiPersonaStorageKey, aiPersonaInstructions)
        .catch((error) => console.error("Unable to persist AI message instructions", error));
    }, 250);
    return set({ aiPersonaInstructions });
  },
  setRelation: (relation: string) => {
    void global.store
      .set(relationStorageKey, relation)
      .catch((error) => console.error("Unable to persist the AI relationship", error));
    return set({ relation });
  },
  startDate: null,
  relation: "Friend",
  setStartDate: (startDate: MaybeDate) => set({ startDate }),
  endDate: null,
  openAiKey: null,
  openAiKeyRevision: 0,
  setEndDate: (endDate: MaybeDate) => set({ endDate }),
  setOpenAiKey: (openAiKey: string | null) => {
    const persistence = openAiKey
      ? global.store.set(openAiLocalStorageKey, openAiKey)
      : Promise.all([global.store.delete(openAiLocalStorageKey), global.store.set(semanticSearchStorageKey, false)]);
    void persistence.catch((error) => console.error("Unable to persist the OpenAI key", error));
    return set((state) => ({
      openAiKey,
      openAiKeyRevision: state.openAiKeyRevision + 1,
      ...(openAiKey ? {} : { useSemanticSearch: false }),
    }));
  },
  chatId: null,
  setChatId: (chatId: number | null) => set({ chatId }),
  isComposingNewMessage: false,
  setIsComposingNewMessage: (isComposingNewMessage: boolean) => set({ isComposingNewMessage }),
  setMessageIdToBringToFocus: (messageIdToBringToFocus: number | null) => set({ messageIdToBringToFocus }),
  setSelectedSearchMessageId: (selectedSearchMessageId: number | null) => set({ selectedSearchMessageId }),
  highlightedMessage: null,
  setHighlightedMessage: (highlightedMessage: Message | null) => set({ highlightedMessage }),
  updateConversation: (chatId: number, updater: (current: AiMessage[]) => AiMessage[]) =>
    set((state) => ({
      extendedConversations: {
        ...state.extendedConversations,
        [chatId]: updater(state.extendedConversations[chatId] || []),
      },
    })),
  extendedConversations: {},
  // wrapped
  wrappedYear: WRAPPED_ALL_TIME_YEAR,
  setWrappedYear: (wrappedYear: number) => set({ wrappedYear }),
}));

export const useSelectedChat = (): Chat | null | undefined => {
  const chatId = useMimessage((state) => state.chatId);
  const chat = useChatById(chatId);
  return chat;
};

export { useMimessage };
