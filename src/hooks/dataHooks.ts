import { useQuery } from "@tanstack/react-query";
import type { ChatList, Contacts, Handle } from "../interfaces";
import type { Contact } from "node-mac-contacts";
const ipcRenderer = global.ipcRenderer;
import parsePhoneNumber from "libphonenumber-js";
import type { MessagesForChat } from "../interfaces";
import type { LatestMessagesForEachChat } from "../interfaces";
import type { LatestMessage } from "../interfaces";
import { getContactName } from "../utils/helpers";
import { uniq } from "lodash-es";

export const useChatList = () => {
  const { data: contacts } = useContactMap();

  const getContactFromHandle = (handle: string) => {
    if (!contacts) {
      return null;
    }
    const baseContact = contacts.get(handle);
    if (baseContact) {
      return baseContact;
    }
    const parsedPhoneNumber = parsePhoneNumber(handle);
    if (parsedPhoneNumber) {
      const phoneContact =
        contacts.get(parsedPhoneNumber.formatNational()) ||
        contacts.get(parsedPhoneNumber.formatInternational()) ||
        contacts.get(parsedPhoneNumber.number) ||
        contacts.get(parsedPhoneNumber.nationalNumber);
      if (phoneContact) {
        return phoneContact;
      }
    }
    const lower = handle.toLowerCase();

    return contacts.get(lower) || null;
  };

  return useQuery<ChatList | null>(["getChatList", Boolean(contacts), contacts?.size], async () => {
    const resp = (await ipcRenderer.invoke("getChatList")) as ChatList;
    if (contacts) {
      for (const chat of resp || []) {
        if (chat.handles.length) {
          for (const handle of chat.handles) {
            handle.contact = getContactFromHandle(handle.id);
          }
        }
      }
    }
    return resp;
  });
};

export const useHandleMap = () => {
  const { data: chatList } = useChatList();

  return useQuery<Record<number, Handle> | null>(["useHandleMap", Boolean(chatList), chatList?.length], async () => {
    const handleMap: Record<number, Handle> | null = {};
    const handles: Handle[] = chatList?.flatMap((chat) => chat.handles) || [];
    for (const handle of handles) {
      handleMap[handle.ROWID!] = handle;
    }
    return handleMap;
  });
};
export const useChatById = (id: number | null) => {
  const { data: list } = useChatList();
  if (id !== null && list) {
    const chat = list.find((chat) => chat.chat_id === id);
    return chat;
  }
  return null;
};

export const useContacts = () => {
  return useQuery<Contacts | null>(["contacts"], async () => {
    const resp = (await ipcRenderer.invoke("contacts")) as Contacts;
    for (const contact of resp) {
      if (contact.emailAddresses) {
        contact.emailAddresses = uniq(contact.emailAddresses.flatMap((email) => [email, email.toLowerCase()]));
      }
      contact.parsedName = getContactName(contact) || "";
    }
    return resp;
  });
};
export const useMessagesForChatId = (id: number | null) => {
  return useQuery<MessagesForChat | null>(["getMessagesForChatId", id], async () => {
    if (!id) {
      return null;
    }
    const resp = (await ipcRenderer.invoke("getMessagesForChatId", id)) as MessagesForChat;
    return resp;
  });
};
export const useLatestMessageForEachChat = () => {
  return useQuery<Record<string | number, LatestMessage> | null>(["getLatestMessageForEachChat"], async () => {
    const resp = (await ipcRenderer.invoke("getLatestMessageForEachChat")) as LatestMessagesForEachChat;
    return resp.reduce((acc, cur) => {
      acc[cur.chat_id as keyof typeof acc] = cur;
      return acc;
    }, {} as Record<string | number, LatestMessage>);
  });
};

export const useContactMap = () => {
  const { data: contacts } = useContacts();
  return useQuery<Map<string | null, Contact>>(
    ["contactMap", Boolean(contacts), contacts?.length, contacts?.[0]],
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
          const phoneNumber = parsePhoneNumber(phone);
          if (phoneNumber) {
            map.set(phoneNumber.formatNational(), contact);
            map.set(phoneNumber.number, contact);
            map.set(phoneNumber.nationalNumber, contact);
            map.set(phoneNumber.formatInternational(), contact);
          }
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
