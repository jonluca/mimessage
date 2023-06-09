import { useMutation, useQuery } from "@tanstack/react-query";
import type { ChatList, Contacts, Handle, MessagesForChat } from "../interfaces";
import type { Contact } from "electron-mac-contacts";
import parsePhoneNumber from "libphonenumber-js";
import { getContactName } from "../utils/helpers";
import { groupBy, uniq } from "lodash-es";
import type { AiMessage } from "../context";
import { useMimessage } from "../context";
import type { Message } from "../interfaces";
import type { PermissionType } from "node-electron-permissions";
import Fuse from "fuse.js";
import type { WrappedStats } from "../interfaces";
import type { Chat } from "../interfaces";
import React from "react";
import type { GlobalSearchResponse } from "../interfaces";
import { shallow } from "zustand/shallow";
import type { SemanticSearchStats } from "../interfaces";
import type { SlowWrappedStats } from "../interfaces";
import type { MessageDates } from "../interfaces";

const ipcRenderer = global.ipcRenderer;
const useDbChatList = () => {
  return useQuery<ChatList | null>(["dbChatList"], async () => {
    const resp = (await ipcRenderer.invoke("getChatList")) as ChatList;
    return resp;
  });
};

export const getChatName = (chat: Chat | null | undefined) => {
  if (!chat) {
    return "";
  }
  if (chat.display_name) {
    return chat.display_name;
  }
  const handles = chat.handles || [];
  const contactsInChat = handles
    .map((handle) => {
      const contact = handle.contact;
      return contact?.parsedName || handle.id;
    })
    .filter(Boolean);

  return contactsInChat.join(", ") || chat.chat_identifier || "";
};

const getContactFromHandle = (handle: string | null, contacts: Map<string | null, Contact>) => {
  if (!handle || !contacts) {
    return null;
  }
  const baseContact = contacts.get(handle) || contacts.get(handle.toLowerCase());
  if (baseContact) {
    return baseContact;
  }
  try {
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
  } catch {
    // ignore
  }

  return null;
};

export const useChatList = () => {
  const { data: dbChats } = useDbChatList();
  const { data: contacts } = useContactMap();

  return useQuery<ChatList | null>(
    ["getChatList", Boolean(contacts), Boolean(dbChats), dbChats?.length, contacts?.size],
    async () => {
      const chats = dbChats || [];
      for (const chat of chats) {
        if (contacts) {
          if (chat.handles.length) {
            for (const handle of chat.handles) {
              handle.contact =
                getContactFromHandle(handle.id, contacts) || getContactFromHandle(handle.uncanonicalized_id, contacts);
            }
          }
        }

        // add chat ids with exactly the same participant contacts together
        const grouped = groupBy(chats, (chat) =>
          chat.handles.map((h) => h.contact?.identifier || h.handle_id).join(", "),
        );
        const sameParticipantChats = Object.values(grouped);
        for (const chats of sameParticipantChats) {
          if (chats.length > 1 && chats[0].handles.length === 1) {
            const chatIds = chats.map((chat) => chat.chat_id).sort() as number[];
            for (const chat of chats) {
              chat.sameParticipantChatIds = chatIds;
            }
          }
        }
        chat.name = getChatName(chat);
      }
      // allocate a new object to trigger a re-render
      return chats.map((c) => ({ ...c }));
    },
  );
};

export const useChatMap = () => {
  const { data: chats } = useChatList();

  return React.useMemo<Map<number, Chat>>(() => {
    const chatMap = new Map<number, Chat>();
    if (chats) {
      for (const chat of chats) {
        if (chat.chat_id) {
          chatMap.set(chat.chat_id, chat);
        }
      }
    }
    return chatMap;
  }, [chats, chats?.length]);
};

export const useHandleMap = () => {
  const { data: chatList } = useChatList();

  return React.useMemo<Record<number | string, Handle>>(() => {
    const handleMap: Record<number | string, Handle> | null = {};
    const handles: Handle[] = chatList?.flatMap((chat) => chat.handles) || [];
    for (const handle of handles) {
      handleMap[handle.ROWID!] = handle;
      handleMap[String(handle.ROWID)] = handle;
    }

    handleMap[0] = {
      ROWID: 0,
      id: "You",
      handle_id: 0,
      contact: {
        parsedName: "You",
        identifier: "you",
      },
      uncanonicalized_id: null,
      chat_id: null,
      person_centric_id: null,
      service: "iMessage",
      country: null,
    };
    return handleMap;
  }, [chatList, chatList?.length]);
};

export const useContactsWithChats = () => {
  const { data: chatList } = useChatList();

  return React.useMemo<Contact[]>(() => {
    const handles: Handle[] = chatList?.flatMap((chat) => chat.handles) || [];
    const contacts = uniq(handles.map((h) => h.contact).filter(Boolean));
    contacts.sort((a, b) => {
      const nameA = getContactName(a);
      const nameB = getContactName(b);
      return nameA.localeCompare(nameB);
    });
    return contacts as Contact[];
  }, [chatList, chatList?.length]);
};

export const useGroupChatList = () => {
  const { data: chatList } = useChatList();

  return React.useMemo<ChatList>(() => {
    const chats: ChatList = chatList?.filter((chat) => chat.handles && chat.handles.length > 1) || [];
    return chats;
  }, [chatList, chatList?.length]);
};
export const useChatById = (id: number | null) => {
  const { data: list } = useChatList();
  if (id !== null && list) {
    return list.find((chat) => chat.chat_id === id);
  }
  return null;
};

const getImageData = (contact: Contact | null | undefined) => {
  if (!contact) {
    return null;
  }
  if (contact.contactThumbnailImage?.length) {
    return contact.contactThumbnailImage;
  }
  if (contact.contactImage?.length) {
    return contact.contactImage;
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
      const imageData = getImageData(contact);

      contact.parsedName = getContactName(contact) || "";
      if (imageData) {
        contact.pngBase64 = `data:image/png;base64, ${Buffer.from(imageData).toString("base64")}`;
      }
    }
    resp.sort((a, b) => {
      const aName = a.parsedName || "";
      const bName = b.parsedName || "";
      return aName.localeCompare(bName);
    });
    return resp;
  });
};

export const useLocalMessagesForChatId = (id: number | null) => {
  const chatMap = useChatMap();

  const chat = chatMap?.get(id!);
  const sameParticipantChatIds = chat?.sameParticipantChatIds;
  return useQuery<MessagesForChat | null>(["getMessagesForChatId", id, sameParticipantChatIds], async () => {
    if (!id) {
      return null;
    }
    const resp = (await ipcRenderer.invoke("getMessagesForChatId", sameParticipantChatIds || id)) as MessagesForChat;
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
    {
      keepPreviousData: true,
    },
  );
  return { ...data, isLoading: data.isLoading || isLoading };
};

export const useAiMessagesForChatId = (id: number | null) => {
  const extendedConversations = useMimessage((state) => state.extendedConversations);
  return (id ? extendedConversations[id] : []) || [];
};

export const useIsCurrentChatSingleMember = () => {
  const chatMap = useChatMap();
  const chatId = useMimessage((state) => state.chatId);
  if (!chatId) {
    return false;
  }
  const chat = chatMap?.get(chatId!);
  if (!chat) {
    return false;
  }
  return chat.handles.length === 1;
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
          map.set(email.toLowerCase(), contact);
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

type HandleMap = Map<string, Set<number>>;
const useContactToHandleMap = () => {
  const { data: chatList } = useChatList();

  return React.useMemo<HandleMap>(() => {
    const map = new Map<string, Set<number>>();
    const handles: Handle[] = chatList?.flatMap((chat) => chat.handles) || [];

    if (!handles?.length) {
      return map;
    }
    for (const handle of handles) {
      const contact = handle.contact;
      if (!contact) {
        continue;
      }
      const handleIds = map.get(contact.identifier) || new Set<number>();
      handleIds.add(handle.ROWID!);
      map.set(contact.identifier, handleIds);
    }
    return map;
  }, [chatList]);
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
export const useIsInitialized = () => {
  return useQuery<boolean>(
    ["isDbInitialized"],
    async () => {
      const resp = (await ipcRenderer.invoke("isInitialized")) as boolean;
      return resp;
    },
    { refetchInterval: (data) => (data ? false : 500) },
  );
};

export const useGlobalSearch = () => {
  const { useSemanticSearch, openAiKey, startDate, endDate, globalSearch, chatFilter, contactFilter } = useMimessage(
    (state) => ({
      startDate: state.startDate,
      endDate: state.endDate,
      contactFilter: state.contactFilter,
      chatFilter: state.chatFilter,
      globalSearch: state.globalSearch,
      openAiKey: state.openAiKey,
      useSemanticSearch: state.useSemanticSearch,
    }),
    shallow,
  );
  const handleMap = useContactToHandleMap();
  return useQuery<GlobalSearchResponse>(
    [
      "globalSearch",
      globalSearch,
      chatFilter,
      contactFilter,
      startDate,
      endDate,
      handleMap.size,
      openAiKey,
      useSemanticSearch,
    ],
    async () => {
      if (!globalSearch) {
        return [];
      }
      const chatIds = chatFilter?.map((c) => c.chat_id!);
      const handleIds = [...new Set(contactFilter?.flatMap((c) => [...(handleMap.get(c.identifier) || [])]))];
      const resp = (await ipcRenderer.invoke(
        "globalSearch",
        globalSearch,
        chatIds,
        handleIds,
        startDate,
        endDate,
        openAiKey,
        useSemanticSearch,
      )) as GlobalSearchResponse;
      // ignore attachments for now, but we should probably show them in the future
      return resp.filter((l) => l.text);
    },
  );
};

export const useEarliestMessageDate = () => {
  return useQuery<Date>(["getEarliestMessageDate"], async () => {
    const resp = (await ipcRenderer.invoke("getEarliestMessageDate")) as Date;
    return resp;
  });
};

interface ChatStat {
  message_count: string | number | bigint;
  chat_id: number | null;
}

export const useWrappedStats = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const chatId = useMimessage((state) => state.chatId);
  const chatMap = useChatMap();
  const chat = chatMap?.get(chatId!);
  const ids = chatId ? chat?.sameParticipantChatIds || [chatId] : null;
  const isInWrapped = useMimessage((state) => state.isInWrapped);

  return useQuery<WrappedStats>(
    ["calculateWrappedStats", wrappedYear, ids, chat],
    async () => {
      const resp = (await ipcRenderer.invoke("calculateWrappedStats", wrappedYear, ids)) as WrappedStats;
      const coalesceSameChats = (stats: ChatStat[]) => {
        const enhancedStat = stats.map((sent) => ({ ...sent, chat: chatMap.get(sent.chat_id!) })).filter(Boolean);
        const grouped = groupBy(
          enhancedStat,
          (stat) => stat.chat?.handles.map((h) => h.contact?.identifier || h.handle_id).join(", ") || stat.chat_id!,
        );
        const sameParticipantChats = Object.values(grouped);

        return sameParticipantChats
          .map((chats) => ({
            chat_id: Number(chats[0].chat_id),
            message_count: chats.reduce((acc, stat) => acc + Number(stat.message_count || 0) || 0, 0),
          }))
          .sort((a, b) => b.message_count - a.message_count) as ChatStat[];
      };
      resp.chatInteractions.sent = coalesceSameChats(resp.chatInteractions.sent);
      resp.chatInteractions.received = coalesceSameChats(resp.chatInteractions.received);
      resp.lateNightInteractions.sent = coalesceSameChats(resp.lateNightInteractions.sent);
      resp.lateNightInteractions.received = coalesceSameChats(resp.lateNightInteractions.received);
      console.log(resp);
      return resp;
    },
    { enabled: isInWrapped },
  );
};

export const useSlowWrappedStats = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const chatId = useMimessage((state) => state.chatId);
  const chatMap = useChatMap();
  const chat = chatMap?.get(chatId!);
  const ids = chatId ? chat?.sameParticipantChatIds || [chatId] : null;
  const isInWrapped = useMimessage((state) => state.isInWrapped);
  return useQuery<SlowWrappedStats>(
    ["calculateSlowWrappedStats", wrappedYear, ids],
    async () => {
      const resp = (await ipcRenderer.invoke("calculateSlowWrappedStats", wrappedYear, ids)) as SlowWrappedStats;
      console.log(resp);
      return resp;
    },
    { enabled: isInWrapped },
  );
};
export const useWrappedDates = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const chatId = useMimessage((state) => state.chatId);
  const chatMap = useChatMap();
  const chat = chatMap?.get(chatId!);
  const ids = chatId ? chat?.sameParticipantChatIds || [chatId] : null;
  const isInWrapped = useMimessage((state) => state.isInWrapped);
  return useQuery<MessageDates>(
    ["getMessageDates", wrappedYear, ids],
    async () => {
      const resp = (await ipcRenderer.invoke("getMessageDates", wrappedYear, ids)) as MessageDates;
      console.log(resp);
      return resp;
    },
    { enabled: isInWrapped },
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

export const useHasSemanticSearch = () => {
  return useQuery<boolean>(["hasSemanticSearch"], async () => {
    return global.store.has("semanticSearch");
  });
};

export const useHomeDir = () => {
  return useQuery<string>(["getHomeDir"], async () => {
    return (await ipcRenderer.invoke("getHomeDir")) as string;
  });
};

export const useSemanticSearchStats = (enabled: boolean) => {
  return useQuery<SemanticSearchStats>(
    ["calculateSemanticSearchStatsEnhanced"],
    async () => {
      return (await ipcRenderer.invoke("calculateSemanticSearchStatsEnhanced")) as SemanticSearchStats;
    },
    { enabled },
  );
};

export const useMessageCount = () => {
  return useQuery<number>(["messageCount"], async () => {
    return (await ipcRenderer.invoke("messageCount")) as number;
  });
};
export const useEmbeddingsCreationProgress = () => {
  return useQuery<number>(
    ["getEmbeddingsCompleted"],
    async () => {
      return (await ipcRenderer.invoke("getEmbeddingsCompleted")) as number;
    },
    { refetchInterval: 1000 },
  );
};
export const useCopyDbMutation = () => {
  return useMutation(["copyDb"], async () => {
    await ipcRenderer.invoke("copyLocalDb");
  });
};
export const useInitialize = () => {
  return useMutation(["initialize"], async () => {
    await ipcRenderer.invoke("initialize");
  });
};

interface CreateEmbeddingsOpts {
  openAiKey: string;
}
export const useCreateSemanticEmbeddings = () => {
  return useMutation({
    mutationFn: async ({ openAiKey }: CreateEmbeddingsOpts) => {
      await ipcRenderer.invoke("createEmbeddings", {
        openAiKey,
      });
    },
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

export const useLoadSemanticResultsIntoMemory = () => {
  return useMutation(["loadVectorsIntoMemory"], async () => {
    await ipcRenderer.invoke("loadVectorsIntoMemory");
  });
};

export const useSemanticSearchCacheSize = () => {
  return useQuery<number | null>(
    ["semanticSearchCacheSize"],
    async () => {
      const resp = (await ipcRenderer.invoke("embeddingsCacheSize")) as number;
      return resp;
    },
    { refetchInterval: 2000 },
  );
};
