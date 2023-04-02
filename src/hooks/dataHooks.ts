import { useQuery } from "@tanstack/react-query";
import psl from "psl";
import type { ChatList } from "../interfaces";
import type { Contacts } from "../interfaces";
import type { Contact } from "node-mac-contacts";
const ipcRenderer = global.ipcRenderer;

const maybeHostname = (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    // strip subdomain
    const parsed = psl.parse(hostname);
    if (parsed.error) {
      return "";
    }
    return parsed.domain;
  } catch (e) {
    return "";
  }
};

export const useChatList = () => {
  return useQuery<ChatList | null>(["getChatList"], async () => {
    const resp = (await ipcRenderer.invoke("getChatList")) as ChatList;
    return resp;
  });
};
export const useChatById = (id: string | null) => {
  const { data: list } = useChatList();
  if (id && list) {
    const chat = list.find((chat) => chat.guid === id);
    return chat;
  }
  return null;
};
export const useContacts = () => {
  return useQuery<Contacts | null>(["contacts"], async () => {
    const resp = (await ipcRenderer.invoke("contacts")) as Contacts;
    return resp;
  });
};

export const useContactMap = () => {
  const { data: contacts } = useContacts();
  return useQuery<Map<string | null, Contact>>(
    ["contactMap", contacts],
    async () => {
      const map = new Map<string | null, Contact>();
      if (!contacts) {
        return map;
      }
      for (const contact of contacts) {
        for (const email of contact.emailAddresses || []) {
          map.set(email, contact);
        }
        for (const phone of contact.phoneNumbers || []) {
          map.set(phone, contact);
        }
      }
      return map;
    },
    { placeholderData: new Map() },
  );
};
export const useChatDateRange = () => {
  return useQuery<{ max: Date; min: Date } | null>(["chat-date-range"], async () => {
    return { max: new Date(), min: new Date() };
  });
};

export const useAccessibilityPermissionsCheck = () => {
  return useQuery<boolean | null>(
    ["accessibility-permissions"],
    async () => {
      const resp = (await ipcRenderer.invoke("accessibility-permissions")) as boolean;
      return resp;
    },
    { refetchInterval: 2000 },
  );
};
