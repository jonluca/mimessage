import { create } from "zustand";
import type { Chat, ChatList } from "./interfaces";
import { useChatById } from "./hooks/dataHooks";
import type { Message } from "./interfaces";
import type { ChatCompletionRequestMessage } from "openai/api";
import type { WrappedEntry } from "./components/wrapped/WrappedList";
import type { Contact } from "node-mac-contacts";

export interface AiMessage extends ChatCompletionRequestMessage {
  date: Date;
  response?: null | ChatCompletionRequestMessage | { errored: true };
}

type ExtendedConversations = Record<number, AiMessage[]>;
export const WRAPPED_ALL_TIME_YEAR = 0;
export interface AppContext {
  // general state
  chatId: number | null;
  setChatId: (updated: number | null) => void;
  highlightedMessage: Message | null;
  setHighlightedMessage: (updated: Message | null) => void;
  // open ai
  relation: string;
  setRelation: (updated: string) => void;
  openAiKey: string | null;
  setOpenAiKey: (key: string | null) => void;
  extendedConversations: ExtendedConversations;
  setExtendedConversations: (updated: ExtendedConversations) => void;
  // wrapped
  wrappedEntry: WrappedEntry | null;
  setWrappedEntry: (entry: WrappedEntry | null) => void;
  wrappedYear: number;
  setWrappedYear: (year: number) => void;
  // global search
  globalSearch: string | null;
  setGlobalSearch: (updated: string | null) => void;
  messageIdToBringToFocus: number | null;
  setMessageIdToBringToFocus: (updated: number | null) => void;
  startDate: string;
  setStartDate: (updated: string) => void;
  endDate: string;
  setEndDate: (updated: string) => void;
  contactFilter: Contact[];
  setContactFilter: (updated: Contact[]) => void;
  chatFilter: ChatList;
  setChatFilter: (updated: ChatList) => void;
  // message filter
  filter: string | null;
  setFilter: (updated: string | null) => void;
  regexSearch: boolean;
  setRegexSearch: (updated: boolean) => void;
  // chat search
  search: string | null;
  setSearch: (updated: string | null) => void;
}
const openAiLocalStorageKey = "openai-key";
const useMimessage = create<AppContext>((set) => ({
  search: null,
  contactFilter: [],
  chatFilter: [],
  setContactFilter: (contactFilter: Contact[]) => set({ contactFilter }),
  setChatFilter: (chatFilter: ChatList) => set({ chatFilter }),
  filter: null,
  messageIdToBringToFocus: null,
  globalSearch: null,
  regexSearch: false,
  setRegexSearch: (regexSearch: boolean) => set({ regexSearch }),
  setSearch: (search: string | null) => set({ search }),
  setFilter: (filter: string | null) => set({ filter }),
  setGlobalSearch: (globalSearch: string | null) => set({ globalSearch }),
  setRelation: (relation: string) => set({ relation }),
  startDate: "",
  relation: "friend",
  setStartDate: (startDate: string) => set({ startDate }),
  endDate: "",
  openAiKey: typeof localStorage === "undefined" ? null : localStorage.getItem(openAiLocalStorageKey) ?? null,
  setEndDate: (endDate: string) => set({ endDate }),
  setOpenAiKey: (openAiKey: string | null) => {
    if (openAiKey) {
      localStorage.setItem(openAiLocalStorageKey, openAiKey);
    } else {
      localStorage.removeItem(openAiLocalStorageKey);
    }
    return set({ openAiKey });
  },
  chatId: null,
  setChatId: (chatId: number | null) => set({ chatId }),
  setMessageIdToBringToFocus: (messageIdToBringToFocus: number | null) => set({ messageIdToBringToFocus }),
  highlightedMessage: null,
  setHighlightedMessage: (highlightedMessage: Message | null) => set({ highlightedMessage }),
  setExtendedConversations: (extendedConversations: ExtendedConversations) =>
    set({ extendedConversations: { ...extendedConversations } }),
  extendedConversations: {},
  // wrapped
  wrappedEntry: null,
  setWrappedEntry: (wrappedEntry: WrappedEntry | null) => set({ wrappedEntry }),
  wrappedYear: WRAPPED_ALL_TIME_YEAR,
  setWrappedYear: (wrappedYear: number) => set({ wrappedYear }),
}));

export const useSelectedChat = (): Chat | null | undefined => {
  const chatId = useMimessage((state) => state.chatId);
  const chat = useChatById(chatId);
  return chat;
};

export { useMimessage };
