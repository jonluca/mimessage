import React, { useEffect, useMemo, useState } from "react";
import { useChatList } from "../../hooks/dataHooks";
import type { Chat } from "../../interfaces";
import { useMimessage } from "../../context";
import { SearchBar } from "./SearchBox";
import Fuse from "fuse.js";
import { ConversationFilterButton, type ConversationListFilter } from "./ImessageWrapped";
import { CHAT_HEIGHT, ChatEntry, isChatUnread } from "./ChatEntry";
import { Virtuoso } from "react-virtuoso";
import { YearSelector } from "../wrapped/YearSelector";
import { SidebarSearchResults } from "../global-search/GlobalSearch";
import { SystemSymbol } from "../SystemSymbol";
import { MessageAvatar } from "../message/Avatar";

const BackIcon = () => <SystemSymbol name="chevron-left" />;

const CHAT_SEARCH_OPTIONS = {
  keys: [
    "display_name",
    "chat_identifier",
    "handles.contact.parsedName",
    "handles.contact.firstName",
    "handles.contact.emailAddresses",
    "handles.contact.phoneNumbers",
    "handles.contact.lastName",
  ],
  shouldSort: true,
  threshold: 0.2,
};

export const CHAT_LIST_WIDTH = 320;
const ChatListWrapper = ({ children }: React.PropsWithChildren) => {
  return (
    <aside
      className="messages-sidebar"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: CHAT_LIST_WIDTH,
        minWidth: CHAT_LIST_WIDTH,
      }}
    >
      {children}
    </aside>
  );
};

const renderChat = (_index: number, chat: Chat) => (chat ? <ChatEntry chat={chat} /> : null);
const computeChatKey = (_index: number, chat: Chat) => chat.chat_id ?? chat.chat_guid;

const VirtualizedList = React.memo(function VirtualizedList({
  chats,
  emptyLabel = "No Conversations",
}: {
  chats: Chat[];
  emptyLabel?: string;
}) {
  if (!chats.length) {
    return (
      <div className="conversation-list-empty">
        <span>{emptyLabel}</span>
      </div>
    );
  }
  return (
    <Virtuoso
      increaseViewportBy={{ top: 300, bottom: 600 }}
      className="conversation-list"
      computeItemKey={computeChatKey}
      style={{ height: "100%", minHeight: 0 }}
      data={chats}
      fixedItemHeight={CHAT_HEIGHT}
      itemContent={renderChat}
      overscan={100}
    />
  );
});

const WrappedBackButton = () => {
  const setIsInWrapped = useMimessage((state) => state.setIsInWrapped);
  return (
    <button
      type="button"
      className="toolbar-icon-button messages-filter-button"
      aria-label="Back to Messages"
      title="Back to Messages"
      onClick={() => setIsInWrapped(false)}
    >
      <BackIcon />
    </button>
  );
};

const NewMessageAvatar = () => (
  <span className="new-message-avatar" aria-hidden="true">
    <SystemSymbol name="person-fill" />
  </span>
);

const NewMessageSidebarRow = () => {
  const setIsComposingNewMessage = useMimessage((state) => state.setIsComposingNewMessage);
  return (
    <button
      type="button"
      className="conversation-row new-message-conversation-row is-selected"
      aria-current="page"
      onClick={() => setIsComposingNewMessage(true)}
    >
      <span className="conversation-unread-indicator" aria-hidden="true" />
      <span className="conversation-avatar">
        <NewMessageAvatar />
      </span>
      <span className="conversation-copy">
        <span className="conversation-title-line">
          <span className="conversation-name">New Message</span>
        </span>
      </span>
    </button>
  );
};

const deduplicateChats = (chats: Chat[]) => {
  const toExclude = new Set<number>();
  const seenChatIds = new Set<number>();
  const deduplicated: Chat[] = [];
  for (const chat of chats) {
    if (!chat || chat.chat_id === null || toExclude.has(chat.chat_id) || seenChatIds.has(chat.chat_id)) {
      continue;
    }
    seenChatIds.add(chat.chat_id);
    for (const id of chat.sameParticipantChatIds || []) {
      if (id !== chat.chat_id) {
        toExclude.add(id);
      }
    }
    deduplicated.push(chat);
  }
  return deduplicated;
};

const normalizeConversationIdentifier = (identifier: string) => identifier.trim().toLocaleLowerCase();

const chatMatchesPinnedIdentifier = (chat: Chat, normalizedIdentifier: string) =>
  [chat.chat_identifier, chat.chat_guid, ...chat.handles.map((handle) => handle.id)]
    .filter((identifier): identifier is string => typeof identifier === "string")
    .some((identifier) => normalizeConversationIdentifier(identifier) === normalizedIdentifier);

export const ChatList = React.memo(function ChatList() {
  const { data } = useChatList();
  const search = useMimessage((state) => state.search);
  const chatId = useMimessage((state) => state.chatId);
  const setChatId = useMimessage((state) => state.setChatId);
  const setGlobalSearch = useMimessage((state) => state.setGlobalSearch);
  const setMessageIdToBringToFocus = useMimessage((state) => state.setMessageIdToBringToFocus);
  const setSearch = useMimessage((state) => state.setSearch);
  const setSelectedSearchMessageId = useMimessage((state) => state.setSelectedSearchMessageId);
  const isInWrapped = useMimessage((state) => state.isInWrapped);
  const isComposingNewMessage = useMimessage((state) => state.isComposingNewMessage);
  const setIsComposingNewMessage = useMimessage((state) => state.setIsComposingNewMessage);
  const [conversationFilter, setConversationFilter] = useState<ConversationListFilter>("all");
  const [pinnedIdentifiers, setPinnedIdentifiers] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void global.ipcRenderer
      .invoke("getPinnedConversationIdentifiers")
      .then((identifiers: unknown) => {
        if (!cancelled && Array.isArray(identifiers)) {
          setPinnedIdentifiers(
            identifiers.filter((identifier): identifier is string => typeof identifier === "string"),
          );
        }
      })
      .catch((error) => console.error("Unable to load pinned conversations", error));
    return () => {
      cancelled = true;
    };
  }, []);
  const fuse = useMemo(() => new Fuse<Chat>(data || [], CHAT_SEARCH_OPTIONS), [data]);
  const allChats = useMemo(() => deduplicateChats(data || []), [data]);
  const hasUnread = useMemo(() => allChats.some(isChatUnread), [allChats]);
  const matchingConversations = useMemo(
    () => deduplicateChats(search ? fuse.search(search).map((result) => result.item) : []),
    [fuse, search],
  );
  const filteredChats = useMemo(() => {
    if (conversationFilter === "unread") {
      return allChats.filter(isChatUnread);
    }
    if (conversationFilter === "unknown") {
      return allChats.filter((chat) => chat.is_filtered === 1);
    }
    if (conversationFilter === "spam") {
      return allChats.filter((chat) => chat.is_blackholed === 1 || chat.latest_message_is_spam === 1);
    }
    if (conversationFilter === "deleted") {
      return [];
    }
    return allChats;
  }, [allChats, conversationFilter]);
  const pinnedChats = useMemo(() => {
    const seen = new Set<number>();
    return pinnedIdentifiers
      .map((identifier) => {
        const normalizedIdentifier = normalizeConversationIdentifier(identifier);
        const chat = allChats.find(
          (chat) =>
            chat.chat_id !== null && !seen.has(chat.chat_id) && chatMatchesPinnedIdentifier(chat, normalizedIdentifier),
        );
        if (chat?.chat_id !== null && chat?.chat_id !== undefined) {
          seen.add(chat.chat_id);
        }
        return chat;
      })
      .filter((chat): chat is Chat => {
        return Boolean(chat && chat.chat_id !== null);
      });
  }, [allChats, pinnedIdentifiers]);
  const pinnedChatIds = useMemo(
    () => new Set(pinnedChats.flatMap((chat) => (chat.chat_id === null ? [] : [chat.chat_id]))),
    [pinnedChats],
  );
  const visibleChats = useMemo(
    () => (isInWrapped ? allChats : filteredChats).filter((chat) => !pinnedChatIds.has(chat.chat_id ?? -1)),
    [allChats, filteredChats, isInWrapped, pinnedChatIds],
  );
  const isConversationSearchActive = Boolean(search && !isInWrapped);

  const selectConversationFilter = (nextFilter: ConversationListFilter) => {
    if (nextFilter === conversationFilter) {
      return;
    }
    setConversationFilter(nextFilter);
    setSearch(null);
    setGlobalSearch(null);
    setMessageIdToBringToFocus(null);
    setSelectedSearchMessageId(null);
    setChatId(null);
    setIsComposingNewMessage(false);
  };

  return (
    <ChatListWrapper>
      <header className="messages-sidebar-toolbar draggable">
        <div className="messages-sidebar-toolbar-spacer" />
        <div className="messages-sidebar-toolbar-actions">
          {isInWrapped ? (
            <WrappedBackButton />
          ) : (
            <ConversationFilterButton
              hasUnread={hasUnread}
              value={conversationFilter}
              onChange={selectConversationFilter}
            />
          )}
        </div>
      </header>
      {!isInWrapped && <SearchBar />}
      {isInWrapped && <YearSelector />}
      <div style={{ position: "relative", display: "flex", flex: "1 1 auto", minHeight: 0 }}>
        <nav
          className="recent-conversations"
          aria-hidden={isConversationSearchActive || undefined}
          aria-label="Conversations"
          style={{
            position: "absolute",
            inset: 0,
            visibility: isConversationSearchActive ? "hidden" : "visible",
            pointerEvents: isConversationSearchActive ? "none" : "auto",
          }}
        >
          {isComposingNewMessage && !isInWrapped ? <NewMessageSidebarRow /> : null}
          {!isComposingNewMessage && !isInWrapped && conversationFilter === "all" && pinnedChats.length ? (
            <section className="pinned-conversations" aria-label="Pinned conversations">
              <div className="pinned-conversations-strip">
                {pinnedChats.map((chat) => {
                  const isSelected =
                    chat.chat_id === chatId || Boolean(chatId && chat.sameParticipantChatIds?.includes(chatId));
                  const contact = chat.handles.length === 1 ? chat.handles[0]?.contact : null;
                  return (
                    <button
                      type="button"
                      className={`pinned-conversation${isSelected ? " is-selected" : ""}${isChatUnread(chat) ? " is-unread" : ""}`}
                      key={chat.chat_id}
                      aria-current={isSelected ? "page" : undefined}
                      onClick={() => {
                        setIsComposingNewMessage(false);
                        setMessageIdToBringToFocus(null);
                        setSelectedSearchMessageId(null);
                        setChatId(chat.chat_id!);
                        setGlobalSearch(null);
                      }}
                    >
                      {chat.text ? <span className="pinned-conversation-preview">{chat.text}</span> : null}
                      <span className="pinned-conversation-avatar">
                        <MessageAvatar contact={contact} fallback={chat.name} size={48} />
                        <span className="pinned-conversation-unread-indicator" aria-hidden="true" />
                      </span>
                      <span className="pinned-conversation-name">{chat.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          <VirtualizedList
            chats={visibleChats}
            emptyLabel={
              conversationFilter === "spam"
                ? "No Spam"
                : conversationFilter === "deleted"
                  ? "No Recently Deleted Messages"
                  : "No Conversations"
            }
          />
        </nav>
        {isConversationSearchActive ? (
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            <SidebarSearchResults conversations={matchingConversations} />
          </div>
        ) : null}
      </div>
    </ChatListWrapper>
  );
});
