import { create } from "zustand";
import type { Chat } from "./interfaces";
import { useChatById } from "./hooks/dataHooks";
import type { Message } from "./interfaces";

export interface AppContext {
  search: string | null;
  setSearch: (updated: string | null) => void;
  startDate: string;
  setStartDate: (updated: string) => void;
  endDate: string;
  setEndDate: (updated: string) => void;
  chatId: number | null;
  setChatId: (updated: number | null) => void;
  highlightedMessage: Message | null;
  setHighlightedMessage: (updated: Message | null) => void;
}
const useMimessage = create<AppContext>((set, get) => ({
  search: null,
  setSearch: (search: string | null) => set({ search }),
  startDate: "",
  setStartDate: (startDate: string) => set({ startDate }),
  endDate: "",
  setEndDate: (endDate: string) => set({ endDate }),
  chatId: null,
  setChatId: (chatId: number | null) => set({ chatId }),
  highlightedMessage: null,
  setHighlightedMessage: (highlightedMessage: Message | null) => set({ highlightedMessage }),
}));

export const useSelectedChat = (): Chat | null | undefined => {
  const chatId = useMimessage((state) => state.chatId);
  const chat = useChatById(chatId);
  return chat;
};

export { useMimessage };
