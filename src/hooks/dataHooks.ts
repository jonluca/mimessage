import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ChatList,
  Contacts,
  Handle,
  LatestMessage,
  LatestMessagesForEachChat,
  MessagesForChat,
} from "../interfaces";
import type { Contact } from "node-mac-contacts";
import parsePhoneNumber from "libphonenumber-js";
import { getContactName } from "../utils/helpers";
import { cloneDeep, groupBy, uniq } from "lodash-es";
import type { AiMessage } from "../context";
import { useMimessage } from "../context";
import type { Message } from "../interfaces";
import type { PermissionType } from "node-mac-permissions";
import Fuse from "fuse.js";
import type { WrappedStats } from "../interfaces";

const ipcRenderer = global.ipcRenderer;
export const useDbChatList = () => {
  return useQuery<ChatList | null>(["dbChatList"], async () => {
    const resp = (await ipcRenderer.invoke("getChatList")) as ChatList;
    return resp;
  });
};

const getContactFromHandle = (handle: string, contacts: Map<string | null, Contact>) => {
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

export const useChatList = () => {
  const { data: dbChats } = useDbChatList();
  const { data: contacts } = useContactMap();

  return useQuery<ChatList | null>(
    ["getChatList", Boolean(contacts), Boolean(dbChats), dbChats?.length, contacts?.size],
    async () => {
      const chats = cloneDeep(dbChats || []);
      if (contacts) {
        for (const chat of chats) {
          if (chat.handles.length) {
            for (const handle of chat.handles) {
              handle.contact = getContactFromHandle(handle.id, contacts);
            }
          }
        }
      }
      return chats;
    },
  );
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
    return list.find((chat) => chat.chat_id === id);
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

export const useLocalMessagesForChatId = (id: number | null) => {
  return useQuery<MessagesForChat | null>(["getMessagesForChatId", id], async () => {
    if (!id) {
      return null;
    }
    const resp = (await ipcRenderer.invoke("getMessagesForChatId", id)) as MessagesForChat;
    return resp;
  });
};

interface DividerMessage {
  divider: true;
}

export type ChatListAggregate = Array<Message | DividerMessage | AiMessage>;
export const useMessagesForChatId = (id: number | null) => {
  const aiMessages = useAiMessagesForChatId(id);
  const { data: localMessages, isLoading } = useLocalMessagesForChatId(id);
  const filter = useMimessage((state) => state.filter);
  const regexSearch = useMimessage((state) => state.regexSearch);

  const data = useQuery<ChatListAggregate>(
    ["getMessagesForChatIdWithAi", id, aiMessages, localMessages?.length, filter, regexSearch],
    async () => {
      const newMessages: ChatListAggregate = [...(aiMessages || [])];
      if (aiMessages?.length) {
        newMessages.unshift({ divider: true });
      }

      if (filter) {
        if (regexSearch) {
          try {
            const regex = new RegExp(filter, "i");
            const filtered = (localMessages || []).filter((l) => regex.test(l.text || ""));
            return [...filtered, ...newMessages];
          } catch (e) {
            // maybe we alert the user?
            return [...(localMessages || []), ...newMessages];
          }
        }
        const fuse = new Fuse(localMessages || [], {
          keys: ["text"],
          threshold: 0.3,
          shouldSort: false,
        });
        const filtered = fuse.search(filter);
        const filteredItems = (filtered || [])
          .map((l) => l.item)
          .sort((a, b) => {
            return (a.date || 0) - (b.date || 0);
          });
        return [...filteredItems, ...newMessages];
      }
      return [...(localMessages || []), ...newMessages];
    },
  );
  return { ...data, isLoading: data.isLoading || isLoading };
};

export const useAiMessagesForChatId = (id: number | null) => {
  const extendedConversations = useMimessage((state) => state.extendedConversations);
  return (id ? extendedConversations[id] : []) || [];
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
export const useDoesLocalDbExist = () => {
  return useQuery<boolean>(["localDbExists"], async () => {
    const resp = (await ipcRenderer.invoke("doesLocalDbCopyExist")) as boolean;
    return resp;
  });
};

export const useEarliestMessageDate = () => {
  return useQuery<Date>(["getEarliestMessageDate"], async () => {
    const resp = (await ipcRenderer.invoke("getEarliestMessageDate")) as Date;
    return resp;
  });
};

export interface WrappedStatsEnhanced extends WrappedStats {
  contactInteractions: Array<WrappedStats["handleInteractions"][number] & { contact: Contact | null }>;
}
export const useWrappedStats = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const { data: contacts } = useContactMap();

  return useQuery<WrappedStatsEnhanced>(
    ["calculateWrappedStats", wrappedYear, Boolean(contacts), contacts?.size],
    async () => {
      const resp = (await ipcRenderer.invoke("calculateWrappedStats", wrappedYear)) as WrappedStatsEnhanced;
      resp.contactInteractions = resp.handleInteractions.map((i) => ({ ...i, contact: null }));
      // dedupe our handles, as one contact can have multiple handles
      if (contacts && contacts.size > 0) {
        const withContacts = resp.handleInteractions.map((i) => {
          const contact = getContactFromHandle(i.handle_identifier, contacts);
          return { ...i, contact };
        });
        const grouped = groupBy(withContacts, (e) => e.contact?.identifier || e.handle_identifier);
        const contactInteractions = Object.values(grouped).map((handles) => {
          const realCount = handles.reduce((acc, cur) => acc + Number(cur.message_count), 0);
          return {
            message_count: realCount,
            contact: handles[0].contact,
            handle_identifier: handles[0].handle_identifier,
          };
        });
        resp.contactInteractions = contactInteractions.sort((a, b) => b.message_count - a.message_count);
      }
      console.log(resp);
      return resp;
    },
  );
};

interface Permissions {
  contactsStatus: PermissionType | "not determined";
  diskAccessStatus: PermissionType | "not determined";
}
export const useHasAllowedPermissions = () => {
  return useQuery<Permissions>(
    ["fullDiskAccessPerms"],
    async () => {
      const resp = (await ipcRenderer.invoke("checkPermissions")) as Permissions;
      return resp;
    },
    {
      refetchInterval: (data) =>
        data && data.contactsStatus === "authorized" && data.diskAccessStatus === "authorized" ? false : 1000,
      refetchOnWindowFocus: (query) => {
        const data = query.state.data;
        return data && data.contactsStatus === "authorized" && data.diskAccessStatus === "authorized"
          ? false
          : "always";
      },
    },
  );
};
export const useCopyDbMutation = () => {
  return useMutation(["copyDb"], async () => {
    await ipcRenderer.invoke("copyLocalDb");
  });
};
export const useSkipContactsCheck = () => {
  return useMutation(["skipContactsCheck"], async () => {
    await ipcRenderer.invoke("skipContactsCheck");
  });
};

export const useRequestAccessMutation = () => {
  return useMutation(["requestPerms"], async () => {
    await ipcRenderer.invoke("fullDiskAccess");
    await ipcRenderer.invoke("requestContactsPerms");
  });
};
export const useOpenFileAtLocation = () => {
  return useMutation(["fileAtLocation"], async (path: string) => {
    await ipcRenderer.invoke("openFileAtFolder", path);
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
