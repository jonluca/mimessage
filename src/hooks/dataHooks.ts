import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { ChatList, Contacts, Handle, MessagePageOptions, MessagesPage, ThreadMessageSearch } from "../interfaces";
import type { Contact } from "electron-mac-contacts";
import parsePhoneNumber from "libphonenumber-js";
import { getContactName } from "../utils/helpers";
import { groupBy, uniq } from "lodash-es";
import type { AiMessage } from "../context";
import { useMimessage } from "../context";
import type { WrappedStats } from "../interfaces";
import type { Chat } from "../interfaces";
import React from "react";
import type { GlobalSearchResponse } from "../interfaces";
import { useShallow } from "zustand/react/shallow";
import type { SemanticSearchStats } from "../interfaces";
import type { SlowWrappedStats } from "../interfaces";
import { getPrependedMessageCount, mergeMessagePages, type TranscriptItem } from "../utils/message-pagination";

const ipcRenderer = global.ipcRenderer;
const EMPTY_MESSAGE_PAGES: MessagesPage[] = [];
const EMPTY_MESSAGE_PAGE_PARAMS: MessagePageOptions[] = [];
const EMPTY_AI_MESSAGES: AiMessage[] = [];
let localDbRefreshedThisSession = false;

const refreshLocalMessagesSnapshot = async () => {
  await ipcRenderer.invoke("copyLocalDb");
  localDbRefreshedThisSession = true;
};
const useDbChatList = () => {
  return useQuery<ChatList | null>({
    queryKey: ["dbChatList"],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("getChatList")) as ChatList;
      return resp;
    },
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
  const contactsInChat = handles.flatMap((handle) => {
    const name = handle.contact?.parsedName || handle.id;
    return name ? [name] : [];
  });

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
  const { data: dbChats, dataUpdatedAt: dbChatsUpdatedAt } = useDbChatList();
  const { data: contacts, dataUpdatedAt: contactsUpdatedAt } = useContactMap();

  return useQuery<ChatList | null>({
    queryKey: ["getChatList", dbChatsUpdatedAt, contactsUpdatedAt],
    queryFn: async () => {
      const chats = (dbChats || []).map((chat) => ({
        ...chat,
        handles: (chat.handles || []).map((handle) => ({ ...handle })),
      }));

      for (const chat of chats) {
        if (contacts && chat.handles.length) {
          for (const handle of chat.handles) {
            handle.contact =
              getContactFromHandle(handle.id, contacts) || getContactFromHandle(handle.uncanonicalized_id, contacts);
          }
        }
        chat.name = getChatName(chat);
      }

      // Group once after contact enrichment. Sorting makes the key independent of
      // participant order and keeps this pass linear apart from small group sorts.
      const grouped = groupBy(chats, (chat) =>
        chat.handles
          .map((handle) => String(handle.contact?.identifier || handle.handle_id))
          .sort()
          .join("\u0000"),
      );
      for (const participantChats of Object.values(grouped)) {
        if (participantChats.length <= 1 || participantChats[0].handles.length !== 1) {
          continue;
        }
        const chatIds = participantChats
          .map((chat) => chat.chat_id)
          .filter((chatId): chatId is number => chatId !== null)
          .sort((a, b) => a - b);
        for (const chat of participantChats) {
          chat.sameParticipantChatIds = chatIds;
        }
      }
      return chats;
    },
    enabled: dbChats !== undefined && contacts !== undefined,
  });
};

const chatMapCache = new WeakMap<ChatList, Map<number, Chat>>();
const handleMapCache = new WeakMap<ChatList, Record<number | string, Handle>>();

export const useChatMap = () => {
  const { data: chats } = useChatList();

  return React.useMemo<Map<number, Chat>>(() => {
    if (chats) {
      const cached = chatMapCache.get(chats);
      if (cached) {
        return cached;
      }
    }
    const chatMap = new Map<number, Chat>();
    if (chats) {
      for (const chat of chats) {
        if (chat.chat_id) {
          chatMap.set(chat.chat_id, chat);
        }
      }
      chatMapCache.set(chats, chatMap);
    }
    return chatMap;
  }, [chats]);
};

export const useHandleMap = () => {
  const { data: chatList } = useChatList();

  return React.useMemo<Record<number | string, Handle>>(() => {
    if (chatList) {
      const cached = handleMapCache.get(chatList);
      if (cached) {
        return cached;
      }
    }
    const handleMap: Record<number | string, Handle> = {};
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
    if (chatList) {
      handleMapCache.set(chatList, handleMap);
    }
    return handleMap;
  }, [chatList]);
};

export const useContactsWithChats = () => {
  const { data: chatList } = useChatList();

  return React.useMemo<Contact[]>(() => {
    const handles: Handle[] = chatList?.flatMap((chat) => chat.handles) || [];
    const contacts = uniq(handles.flatMap((handle) => (handle.contact ? [handle.contact] : [])));
    contacts.sort((a, b) => {
      const nameA = getContactName(a);
      const nameB = getContactName(b);
      return nameA.localeCompare(nameB);
    });
    return contacts as Contact[];
  }, [chatList]);
};

export const useGroupChatList = () => {
  const { data: chatList } = useChatList();

  return React.useMemo<ChatList>(() => {
    const chats: ChatList = chatList?.filter((chat) => chat.handles && chat.handles.length > 1) || [];
    return chats;
  }, [chatList]);
};
export const useChatById = (id: number | null) => {
  const chatMap = useChatMap();
  return id === null ? null : chatMap.get(id);
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

export const useContacts = (enabled = true) => {
  return useQuery<Contacts | null>({
    queryKey: ["contacts"],
    queryFn: async () => {
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
    },
    enabled,
  });
};

export type MessageHistoryOrigin = number | "oldest" | null;

const getInitialMessagePageParam = (origin: MessageHistoryOrigin): MessagePageOptions => {
  if (typeof origin === "number") {
    return { anchorMessageId: origin };
  }
  return { position: origin === "oldest" ? "oldest" : "latest" };
};

export const useLocalMessagesForChatId = (id: number | null, origin: MessageHistoryOrigin = null) => {
  const chatMap = useChatMap();

  const chat = id === null ? undefined : chatMap.get(id);
  const sameParticipantChatIds = chat?.sameParticipantChatIds;
  const chatIds = sameParticipantChatIds?.length ? sameParticipantChatIds : id;
  const initialPageParam = React.useMemo(() => getInitialMessagePageParam(origin), [origin]);
  const query = useInfiniteQuery<
    MessagesPage,
    Error,
    InfiniteData<MessagesPage, MessagePageOptions>,
    readonly unknown[],
    MessagePageOptions
  >({
    queryKey: [
      "getMessagesPage",
      id,
      sameParticipantChatIds?.join(",") || "",
      typeof origin === "number" ? `anchor:${origin}` : origin || "latest",
    ],
    queryFn: async ({ pageParam }) => {
      if (id === null) {
        throw new Error("A chat must be selected before loading messages");
      }
      const resp = (await ipcRenderer.invoke("getMessagesPage", chatIds, pageParam)) as MessagesPage;
      return resp;
    },
    initialPageParam,
    getPreviousPageParam: (firstPage) =>
      firstPage.hasOlder && firstPage.olderCursor ? { cursor: firstPage.olderCursor, direction: "older" } : undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasNewer && lastPage.newerCursor ? { cursor: lastPage.newerCursor, direction: "newer" } : undefined,
    enabled: id !== null,
  });
  const pages = query.data?.pages || EMPTY_MESSAGE_PAGES;
  const pageParams = query.data?.pageParams || EMPTY_MESSAGE_PAGE_PARAMS;
  const messages = React.useMemo(() => mergeMessagePages(pages), [pages]);
  const prependedMessageCount = React.useMemo(() => getPrependedMessageCount(pages, pageParams), [pageParams, pages]);
  const oldestPredecessor = pages[0]?.oldestPredecessor ?? null;
  const newestSuccessor = pages.at(-1)?.newestSuccessor ?? null;

  return {
    ...query,
    data: id === null ? null : messages,
    pages,
    prependedMessageCount,
    oldestPredecessor,
    newestSuccessor,
  };
};

export type ChatListAggregate = TranscriptItem[];
export const useMessagesForChatId = (id: number | null, origin: MessageHistoryOrigin = null) => {
  const aiMessages = useAiMessagesForChatId(id);
  const history = useLocalMessagesForChatId(id, origin);
  const filter = useMimessage((state) => state.filter);
  const regexSearch = useMimessage((state) => state.regexSearch);
  const normalizedFilter = filter?.trim() || "";
  const chatMap = useChatMap();
  const chat = id === null ? undefined : chatMap.get(id);
  const sameParticipantChatIds = chat?.sameParticipantChatIds;
  const chatIds = sameParticipantChatIds?.length ? sameParticipantChatIds : id;
  const search = useQuery<ThreadMessageSearch>({
    queryKey: ["searchMessagesForChatId", id, sameParticipantChatIds?.join(",") || "", normalizedFilter, regexSearch],
    queryFn: async () =>
      (await ipcRenderer.invoke(
        "searchMessagesForChatId",
        chatIds,
        normalizedFilter,
        regexSearch,
        1_000,
      )) as ThreadMessageSearch,
    enabled: id !== null && Boolean(normalizedFilter),
    retry: false,
  });
  const visibleAiMessages = history.pages.length > 0 && history.hasNextPage === false ? aiMessages : EMPTY_AI_MESSAGES;
  const historyData = React.useMemo<ChatListAggregate>(() => {
    const appendedMessages: ChatListAggregate = [...visibleAiMessages];
    if (visibleAiMessages.length) {
      appendedMessages.unshift({ divider: true });
    }
    return [...(history.data || []), ...appendedMessages];
  }, [history.data, visibleAiMessages]);
  const searchData = React.useMemo<ChatListAggregate>(() => search.data || [], [search.data]);
  const isSearching = Boolean(normalizedFilter);

  return {
    aiMessages,
    visibleAiMessages,
    data: isSearching ? searchData : historyData,
    historyData,
    searchData,
    isSearching,
    isLoading: isSearching ? search.isLoading : history.isLoading,
    isHistoryLoading: history.isLoading,
    isSearchLoading: search.isLoading,
    isFetchingHistory: history.isFetching,
    isFetchingPreviousPage: history.isFetchingPreviousPage,
    isFetchingNextPage: history.isFetchingNextPage,
    fetchPreviousPage: history.fetchPreviousPage,
    fetchNextPage: history.fetchNextPage,
    hasPreviousPage: history.hasPreviousPage,
    hasNextPage: history.hasNextPage,
    newestSuccessor: history.newestSuccessor,
    oldestPredecessor: history.oldestPredecessor,
    prependedMessageCount: history.prependedMessageCount,
    historyError: history.error,
    searchError: search.error,
  };
};

export const useAiMessagesForChatId = (id: number | null) => {
  return useMimessage((state) => (id === null ? undefined : state.extendedConversations[id]) || EMPTY_AI_MESSAGES);
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
  const { data: contacts, dataUpdatedAt } = useContacts();
  return useQuery<Map<string | null, Contact>>({
    queryKey: ["contactMap", dataUpdatedAt],
    queryFn: async () => {
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
          try {
            const phoneNumber = parsePhoneNumber(phone);
            if (phoneNumber) {
              map.set(phoneNumber.formatNational(), contact);
              map.set(phoneNumber.number, contact);
              map.set(phoneNumber.nationalNumber, contact);
              map.set(phoneNumber.formatInternational(), contact);
            }
          } catch {
            // Preserve the original contact value even if it is not a parseable number.
          }
        }
      }
      return map;
    },
    placeholderData: new Map(),
    enabled: contacts !== undefined,
  });
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
  return useQuery<{ max: Date; min: Date } | null>({
    queryKey: ["chat-date-range"],
    queryFn: async () => {
      return { max: new Date(), min: new Date() };
    },
  });
};
export const useDoesLocalDbExist = () => {
  return useQuery<boolean>({
    queryKey: ["localDbExists"],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("doesLocalDbCopyExist")) as boolean;
      return resp;
    },
  });
};
export const useIsInitialized = (enabled = true) => {
  return useQuery<boolean>({
    queryKey: ["isDbInitialized"],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("isInitialized")) as boolean;
      return resp;
    },
    enabled,
    refetchInterval: (query) => (enabled && !query.state.data ? 500 : false),
  });
};

export const useGlobalSearch = () => {
  const {
    useSemanticSearch,
    openAiKey,
    openAiKeyRevision,
    startDate,
    endDate,
    globalSearch,
    chatFilter,
    contactFilter,
  } = useMimessage(
    useShallow((state) => ({
      startDate: state.startDate,
      endDate: state.endDate,
      contactFilter: state.contactFilter,
      chatFilter: state.chatFilter,
      globalSearch: state.globalSearch,
      openAiKey: state.openAiKey,
      openAiKeyRevision: state.openAiKeyRevision,
      useSemanticSearch: state.useSemanticSearch,
    })),
  );
  const handleMap = useContactToHandleMap();
  const normalizedSearch = globalSearch?.trim() || "";
  const chatIds = React.useMemo(
    () =>
      chatFilter
        .map((chat) => chat.chat_id)
        .filter((chatId): chatId is number => chatId !== null)
        .sort((a, b) => a - b),
    [chatFilter],
  );
  const handleIds = React.useMemo(
    () =>
      [...new Set(contactFilter.flatMap((contact) => [...(handleMap.get(contact.identifier) || [])]))].sort(
        (a, b) => a - b,
      ),
    [contactFilter, handleMap],
  );
  return useQuery<GlobalSearchResponse>({
    queryKey: [
      "globalSearch",
      normalizedSearch,
      chatIds.join(","),
      handleIds.join(","),
      startDate?.getTime() || 0,
      endDate?.getTime() || 0,
      openAiKeyRevision,
      useSemanticSearch,
    ],
    queryFn: async () => {
      if (!normalizedSearch) {
        return [];
      }
      const resp = (await ipcRenderer.invoke(
        "globalSearch",
        normalizedSearch,
        chatIds,
        handleIds,
        startDate,
        endDate,
        openAiKey,
        useSemanticSearch,
      )) as GlobalSearchResponse;
      return resp;
    },
    enabled: Boolean(normalizedSearch),
  });
};

export const useEarliestMessageDate = () => {
  return useQuery<Date>({
    queryKey: ["getEarliestMessageDate"],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("getEarliestMessageDate")) as Date;
      return resp;
    },
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

  return useQuery<WrappedStats>({
    queryKey: ["calculateWrappedStats", wrappedYear, ids?.join(",") || "all", chatMap.size],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("calculateWrappedStats", wrappedYear, ids)) as WrappedStats;
      const coalesceSameChats = (stats: ChatStat[]) => {
        const enhancedStat = stats.map((sent) => ({ ...sent, chat: chatMap.get(sent.chat_id!) }));
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
      return resp;
    },
    enabled: isInWrapped,
  });
};

export const useSlowWrappedStats = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const chatId = useMimessage((state) => state.chatId);
  const chatMap = useChatMap();
  const chat = chatMap?.get(chatId!);
  const ids = chatId ? chat?.sameParticipantChatIds || [chatId] : null;
  const isInWrapped = useMimessage((state) => state.isInWrapped);
  return useQuery<SlowWrappedStats>({
    queryKey: ["calculateSlowWrappedStats", wrappedYear, ids?.join(",") || "all"],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("calculateSlowWrappedStats", wrappedYear, ids)) as SlowWrappedStats;
      return resp;
    },
    enabled: isInWrapped,
  });
};

type PermissionStatus = "authorized" | "denied" | "not determined" | "restricted" | "unknown";
interface Permissions {
  contactsStatus: PermissionStatus;
  diskAccessStatus: PermissionStatus;
}
export const useHasAllowedPermissions = () => {
  return useQuery<Permissions>({
    queryKey: ["fullDiskAccessPerms"],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("checkPermissions")) as Permissions;
      return resp;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.contactsStatus === "authorized" && data.diskAccessStatus === "authorized" ? false : 1000;
    },
    refetchOnWindowFocus: (query) => {
      const data = query.state.data;
      return data && data.contactsStatus === "authorized" && data.diskAccessStatus === "authorized" ? false : "always";
    },
  });
};

export const useHasSemanticSearch = () => {
  return useQuery<boolean>({
    queryKey: ["hasSemanticSearch"],
    queryFn: async () => {
      return (await global.store.get("semanticSearch")) === true;
    },
  });
};

export const useHomeDir = () => {
  return useQuery<string>({
    queryKey: ["getHomeDir"],
    queryFn: async () => {
      return (await ipcRenderer.invoke("getHomeDir")) as string;
    },
  });
};

export const useSemanticSearchStats = (enabled: boolean) => {
  return useQuery<SemanticSearchStats>({
    queryKey: ["calculateSemanticSearchStatsEnhanced"],
    queryFn: async () => {
      return (await ipcRenderer.invoke("calculateSemanticSearchStatsEnhanced")) as SemanticSearchStats;
    },
    enabled,
  });
};

export const useMessageCount = () => {
  return useQuery<number>({
    queryKey: ["messageCount"],
    queryFn: async () => {
      return (await ipcRenderer.invoke("messageCount")) as number;
    },
  });
};

export interface EmbeddingsCreationProgress {
  completedRecords: number;
  status: "idle" | "running" | "complete" | "error";
  totalRecords: number;
}

export const useEmbeddingsCreationProgress = (enabled = true) => {
  return useQuery<EmbeddingsCreationProgress>({
    queryKey: ["getEmbeddingsCompleted"],
    queryFn: async () => {
      return (await ipcRenderer.invoke("getEmbeddingsCompleted")) as EmbeddingsCreationProgress;
    },
    enabled,
    refetchInterval: enabled ? 1000 : false,
  });
};
export const useCopyDbMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["copyDb"],
    mutationFn: async () => {
      await refreshLocalMessagesSnapshot();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["localDbExists"] }),
  });
};
export const useInitialize = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["initialize"],
    mutationFn: async () => {
      if (!localDbRefreshedThisSession) {
        await refreshLocalMessagesSnapshot();
      }
      await ipcRenderer.invoke("initialize");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["isDbInitialized"] }),
  });
};

interface CreateEmbeddingsOpts {
  openAiKey: string;
}
export const useCreateSemanticEmbeddings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["createEmbeddings"],
    mutationFn: async ({ openAiKey }: CreateEmbeddingsOpts) => {
      await ipcRenderer.invoke("createEmbeddings", {
        openAiKey,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calculateSemanticSearchStatsEnhanced"] }),
        queryClient.invalidateQueries({ queryKey: ["getEmbeddingsCompleted"] }),
      ]);
    },
  });
};
export const useSkipContactsCheck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["skipContactsCheck"],
    mutationFn: async () => {
      await ipcRenderer.invoke("skipContactsCheck");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fullDiskAccessPerms"] }),
  });
};

export const useRequestAccessMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["requestPerms"],
    mutationFn: async () => {
      await ipcRenderer.invoke("requestContactsPerms");
      await ipcRenderer.invoke("fullDiskAccess");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fullDiskAccessPerms"] }),
  });
};
export const useOpenFileAtLocation = () => {
  return React.useCallback(async (path: string) => {
    await ipcRenderer.invoke("openFileAtFolder", path);
  }, []);
};

export const useSemanticSearchCacheSize = (enabled = false) => {
  return useQuery<number | null>({
    queryKey: ["semanticSearchCacheSize"],
    queryFn: async () => {
      const resp = (await ipcRenderer.invoke("embeddingsCacheSize")) as number;
      return resp;
    },
    enabled,
    refetchInterval: enabled ? 2000 : false,
  });
};
