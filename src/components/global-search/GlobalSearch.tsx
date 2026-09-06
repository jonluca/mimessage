import React, { useMemo, useState } from "react";
import Highlighter from "react-highlight-words";
import { useShallow } from "zustand/react/shallow";
import { useMimessage } from "../../context";
import { useChatMap, useGlobalSearch, useHandleMap, useHomeDir } from "../../hooks/dataHooks";
import type { Chat, GlobalSearchResult, Handle } from "../../interfaces";
import { MessageAvatar } from "../message/Avatar";
import { SystemSymbol, type SystemSymbolName } from "../SystemSymbol";

const CONVERSATION_LIMIT = 4;
const COLLAPSED_MESSAGE_LIMIT = 3;
const COLLAPSED_LINK_LIMIT = 6;
const COLLAPSED_PHOTO_LIMIT = 9;
const COLLAPSED_DOCUMENT_LIMIT = 3;
const SEARCH_PAGE_SIZE = 100;

const PHOTO_EXTENSIONS = new Set(["gif", "heic", "heif", "jpeg", "jpg", "mov", "mp4", "png", "tiff", "webp"]);
const DOCUMENT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "key",
  "numbers",
  "pages",
  "pdf",
  "ppt",
  "pptx",
  "rtf",
  "txt",
  "xls",
  "xlsx",
  "zip",
]);

interface AttachmentHit {
  attachment: GlobalSearchResult;
  parent: GlobalSearchResult;
}

interface LinkHit {
  parent: GlobalSearchResult;
  url: string;
}

const EMPTY_SEARCH_RESULTS: GlobalSearchResult[] = [];

const searchWords = (query: string, semantic: boolean) => (semantic ? [] : query.trim().split(/\s+/u).filter(Boolean));

const SearchMatch = ({ query, semantic, text }: { query: string; semantic: boolean; text: string }) => (
  <Highlighter
    autoEscape
    highlightClassName="sidebar-search-match"
    highlightTag="strong"
    searchWords={searchWords(query, semantic)}
    textToHighlight={text}
  />
);

const getFileLabel = (attachment: GlobalSearchResult) => {
  const candidate = attachment.transfer_name || attachment.filename || "Attachment";
  return candidate.split("/").filter(Boolean).at(-1) || candidate;
};

const getFileExtension = (attachment: GlobalSearchResult) =>
  getFileLabel(attachment).split(".").at(-1)?.toLocaleLowerCase() || "";

const isPhotoAttachment = (attachment: GlobalSearchResult) =>
  Boolean(attachment.mime_type?.startsWith("image/") || attachment.mime_type?.startsWith("video/")) ||
  PHOTO_EXTENSIONS.has(getFileExtension(attachment));

const isDocumentAttachment = (attachment: GlobalSearchResult) =>
  Boolean(
    attachment.mime_type === "application/pdf" ||
    attachment.mime_type?.startsWith("text/") ||
    attachment.mime_type?.includes("document") ||
    attachment.mime_type?.includes("presentation") ||
    attachment.mime_type?.includes("spreadsheet") ||
    attachment.mime_type?.includes("zip"),
  ) || DOCUMENT_EXTENSIONS.has(getFileExtension(attachment));

const extractHttpUrls = (text: string | null) => {
  if (!text) {
    return [];
  }
  const candidates = text.match(/https?:\/\/[^\s]+/giu) || [];
  return candidates.flatMap((candidate) => {
    const trimmed = candidate.replace(/[),.!?;:'"\]}]+$/u, "");
    try {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? [url.toString()] : [];
    } catch {
      return [];
    }
  });
};

const isLocationUrl = (value: string) => {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^www\./u, "");
  return (
    hostname === "maps.apple.com" ||
    hostname === "maps.google.com" ||
    (hostname === "google.com" && url.pathname.startsWith("/maps")) ||
    (hostname === "goo.gl" && url.pathname.startsWith("/maps"))
  );
};

const textMatchesQuery = (text: string | null, query: string) => {
  const normalizedText = text?.toLocaleLowerCase() || "";
  const terms = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  return terms.length > 0 && terms.every((term) => normalizedText.includes(term));
};

const encodeAssetPath = (value: string) => value.split("/").map(encodeURIComponent).join("/");

const getAttachmentAssetUrl = (attachment: GlobalSearchResult, homeDir: string | undefined) => {
  const originalPath = attachment.filename || "";
  const absolutePath = originalPath.startsWith("~/")
    ? homeDir
      ? `${homeDir}${originalPath.slice(1)}`
      : ""
    : originalPath;
  return absolutePath ? `mimessage-asset://${encodeAssetPath(absolutePath)}` : "";
};

const getLinkPreviewAttachment = (parent: GlobalSearchResult) =>
  ([parent, ...(parent.attachmentMessages || [])] as GlobalSearchResult[]).find(
    (attachment) => isPhotoAttachment(attachment) && Boolean(attachment.filename),
  );

const getLinkTitle = (parent: GlobalSearchResult, url: string) => {
  const messageCopy = (parent.text || "")
    .replaceAll(/https?:\/\/[^\s]+/giu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return messageCopy || new URL(url).hostname.replace(/^www\./u, "");
};

const contentSymbolNames: Record<"document" | "link" | "video", SystemSymbolName> = {
  document: "doc-fill",
  link: "link",
  video: "video",
};

const ContentIcon = ({ kind }: { kind: keyof typeof contentSymbolNames }) => (
  <SystemSymbol name={contentSymbolNames[kind]} />
);

const resultTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  hour12: false,
  minute: "2-digit",
});
const resultDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const resultDateWithYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatResultDate = (date: Date) => {
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return resultTimeFormatter.format(date);
  }
  if (date.getFullYear() === today.getFullYear()) {
    return resultDateFormatter.format(date);
  }
  return resultDateWithYearFormatter.format(date);
};

const getConversationContact = (chat: Chat | undefined) =>
  chat?.handles?.length === 1 ? chat.handles[0]?.contact : null;

const getResultDetails = (
  result: GlobalSearchResult,
  chat: Chat | undefined,
  handleMap: Record<number | string, Handle>,
) => {
  const handle = handleMap[result.handle_id!];
  const senderContact = handle?.contact;
  const conversationContact = getConversationContact(chat);
  const sender = result.is_from_me ? "You" : senderContact?.parsedName || handle?.id || "Unknown Sender";
  const title = chat?.name || sender;
  const avatarContact = conversationContact || senderContact;
  return { avatarContact, sender, title };
};

const moveSearchResultFocus: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-search-result]:not(:disabled)"),
  );
  if (!buttons.length) {
    return;
  }
  event.preventDefault();
  const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const direction = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + buttons.length) % buttons.length;
  buttons[nextIndex]?.focus();
};

const ConversationResult = ({
  chat,
  onSelect,
  query,
  selected,
  semantic,
}: {
  chat: Chat;
  onSelect: (chat: Chat) => void;
  query: string;
  selected: boolean;
  semantic: boolean;
}) => (
  <li className="sidebar-search-conversation-item">
    <button
      type="button"
      data-search-result
      className={`sidebar-search-conversation-button${selected ? " is-selected" : ""}`}
      aria-current={selected ? "page" : undefined}
      aria-label={`Open conversation with ${chat.name || "Unknown"}`}
      onClick={() => onSelect(chat)}
    >
      <span className="sidebar-search-conversation-avatar" aria-hidden="true">
        <MessageAvatar contact={getConversationContact(chat)} fallback={chat.name || "?"} size={20} />
      </span>
      <span className="sidebar-search-conversation-name">
        <SearchMatch query={query} semantic={semantic} text={chat.name || "Unknown"} />
      </span>
    </button>
  </li>
);

const MessageResult = ({
  chat,
  handleMap,
  onSelect,
  query,
  result,
  selected,
  semantic,
}: {
  chat: Chat | undefined;
  handleMap: Record<number | string, Handle>;
  onSelect: (result: GlobalSearchResult) => void;
  query: string;
  result: GlobalSearchResult;
  selected: boolean;
  semantic: boolean;
}) => {
  const { avatarContact, sender, title } = getResultDetails(result, chat, handleMap);
  const resultDate = result.date_obj && !Number.isNaN(result.date_obj.getTime()) ? result.date_obj : null;

  return (
    <li className="sidebar-search-message-item">
      <button
        type="button"
        data-search-result
        className={`sidebar-search-message-button${result.is_from_me ? " is-from-me" : ""}${
          selected ? " is-selected" : ""
        }`}
        aria-current={selected ? "true" : undefined}
        aria-label={`Open message in ${title}: ${sender}, ${result.text || "attachment"}${
          resultDate ? `, ${formatResultDate(resultDate)}` : ""
        }`}
        onClick={() => onSelect(result)}
      >
        <span className="sidebar-search-message-avatar" aria-hidden="true">
          <MessageAvatar contact={avatarContact} fallback={title} size={28} />
        </span>
        <span className="sidebar-search-message-content">
          <span className="sidebar-search-message-preview">
            <SearchMatch query={query} semantic={semantic} text={result.text || "Attachment"} />
          </span>
        </span>
        <span className="sidebar-search-message-meta" aria-hidden="true">
          {resultDate ? (
            <time className="sidebar-search-message-date" dateTime={resultDate.toISOString()}>
              {formatResultDate(resultDate)}
            </time>
          ) : null}
          <SystemSymbol name="chevron-right" />
        </span>
      </button>
    </li>
  );
};

type SearchSection = "messages" | "photos" | "links" | "locations" | "documents";
type SearchPages = Partial<Record<SearchSection, number>>;

const getPageIndex = (page: number, total: number) =>
  Math.min(page, Math.max(0, Math.ceil(total / SEARCH_PAGE_SIZE) - 1));

const getVisibleResults = <T,>(results: T[], page: number | undefined, collapsedLimit: number) => {
  const start = page === undefined ? 0 : getPageIndex(page, results.length) * SEARCH_PAGE_SIZE;
  return results.slice(start, start + (page === undefined ? collapsedLimit : SEARCH_PAGE_SIZE));
};

const SearchPagination = ({
  onPageChange,
  page,
  title,
  total,
}: {
  onPageChange: (page: number) => void;
  page: number | undefined;
  title: string;
  total: number;
}) => {
  if (page === undefined || total <= SEARCH_PAGE_SIZE) {
    return null;
  }
  const currentPage = getPageIndex(page, total);
  const start = currentPage * SEARCH_PAGE_SIZE;
  return (
    <nav className="sidebar-search-section-header" aria-label={`${title} result pages`}>
      <button
        type="button"
        className="sidebar-search-show-more"
        disabled={currentPage === 0}
        onClick={(event) => {
          onPageChange(currentPage - 1);
          event.currentTarget.closest("section")?.scrollIntoView({ block: "start" });
        }}
      >
        Previous
      </button>
      <span className="sidebar-search-result-limit" role="status">
        {start + 1}–{Math.min(start + SEARCH_PAGE_SIZE, total)} of {total}
      </span>
      <button
        type="button"
        className="sidebar-search-show-more"
        disabled={start + SEARCH_PAGE_SIZE >= total}
        onClick={(event) => {
          onPageChange(currentPage + 1);
          event.currentTarget.closest("section")?.scrollIntoView({ block: "start" });
        }}
      >
        Next
      </button>
    </nav>
  );
};

const SearchSectionHeader = ({
  expanded,
  hasMore,
  id,
  onExpand,
  title,
}: {
  expanded: boolean;
  hasMore: boolean;
  id: string;
  onExpand: () => void;
  title: string;
}) => (
  <header className="sidebar-search-section-header">
    <h2 className="sidebar-search-section-title" id={id}>
      {title}
    </h2>
    {hasMore && !expanded ? (
      <button type="button" className="sidebar-search-show-more" onClick={onExpand}>
        Show More
      </button>
    ) : null}
  </header>
);

const PhotoSearchSection = ({
  chatMap,
  page,
  handleMap,
  hits,
  homeDir,
  onPageChange,
  onSelect,
}: {
  chatMap: Map<number, Chat>;
  page: number | undefined;
  handleMap: Record<number | string, Handle>;
  hits: AttachmentHit[];
  homeDir: string | undefined;
  onPageChange: (page: number) => void;
  onSelect: (result: GlobalSearchResult) => void;
}) => {
  const visibleHits = getVisibleResults(hits, page, COLLAPSED_PHOTO_LIMIT);
  return (
    <section className="sidebar-search-section sidebar-search-photos" aria-labelledby="sidebar-photos-title">
      <SearchSectionHeader
        expanded={page !== undefined}
        hasMore={hits.length > COLLAPSED_PHOTO_LIMIT}
        id="sidebar-photos-title"
        onExpand={() => onPageChange(0)}
        title="Photos"
      />
      <ul className="sidebar-search-photo-grid">
        {visibleHits.map(({ attachment, parent }) => {
          const label = getFileLabel(attachment);
          const assetUrl = getAttachmentAssetUrl(attachment, homeDir);
          const { avatarContact, title } = getResultDetails(parent, chatMap.get(parent.chat_id!), handleMap);
          const isImage =
            Boolean(attachment.mime_type?.startsWith("image/")) ||
            ["gif", "heic", "heif", "jpeg", "jpg", "png", "tiff", "webp"].includes(getFileExtension(attachment));
          return (
            <li key={`${parent.message_id ?? parent.guid}-${attachment.attachment_id ?? label}`}>
              <button
                type="button"
                data-search-result
                className="sidebar-search-photo-button"
                aria-label={`Open ${label} in conversation`}
                onClick={() => onSelect(parent)}
              >
                <span className="sidebar-search-photo-preview">
                  {assetUrl && isImage ? (
                    <img src={assetUrl} alt="" decoding="async" loading="lazy" />
                  ) : (
                    <span className="sidebar-search-content-icon">
                      <ContentIcon kind="video" />
                    </span>
                  )}
                  {avatarContact ? (
                    <span className="sidebar-search-photo-avatar" aria-hidden="true">
                      <MessageAvatar contact={avatarContact} fallback={title} size={26} />
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <SearchPagination onPageChange={onPageChange} page={page} title="Photos" total={hits.length} />
    </section>
  );
};

const LinkSearchSection = ({
  chatMap,
  page,
  handleMap,
  hits,
  homeDir,
  onPageChange,
  onSelect,
  query,
  sectionKey = "links",
  title = "Links",
}: {
  chatMap: Map<number, Chat>;
  page: number | undefined;
  handleMap: Record<number | string, Handle>;
  hits: LinkHit[];
  homeDir: string | undefined;
  onPageChange: (page: number) => void;
  onSelect: (result: GlobalSearchResult) => void;
  query: string;
  sectionKey?: "links" | "locations";
  title?: string;
}) => {
  const visibleHits = getVisibleResults(hits, page, COLLAPSED_LINK_LIMIT);
  const titleId = `sidebar-${sectionKey}-title`;
  return (
    <section className={`sidebar-search-section sidebar-search-${sectionKey}`} aria-labelledby={titleId}>
      <SearchSectionHeader
        expanded={page !== undefined}
        hasMore={hits.length > COLLAPSED_LINK_LIMIT}
        id={titleId}
        onExpand={() => onPageChange(0)}
        title={title}
      />
      <ul className="sidebar-search-link-grid">
        {visibleHits.map(({ parent, url }) => {
          const hostname = new URL(url).hostname.replace(/^www\./u, "");
          const title = getLinkTitle(parent, url);
          const previewAttachment = getLinkPreviewAttachment(parent);
          const previewUrl = previewAttachment ? getAttachmentAssetUrl(previewAttachment, homeDir) : "";
          const { avatarContact, title: conversationTitle } = getResultDetails(
            parent,
            chatMap.get(parent.chat_id!),
            handleMap,
          );
          return (
            <li key={`${parent.message_id ?? parent.guid}-${url}`}>
              <button
                type="button"
                data-search-result
                className="sidebar-search-link-button"
                aria-label={`Open link from ${hostname} in conversation`}
                onClick={() => onSelect(parent)}
              >
                <span className="sidebar-search-link-preview" aria-hidden="true">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" decoding="async" loading="lazy" />
                  ) : (
                    <span className="sidebar-search-link-fallback">
                      <ContentIcon kind="link" />
                    </span>
                  )}
                  {avatarContact ? (
                    <span className="sidebar-search-link-avatar">
                      <MessageAvatar contact={avatarContact} fallback={conversationTitle} size={26} />
                    </span>
                  ) : null}
                </span>
                <span className="sidebar-search-link-copy">
                  <span className="sidebar-search-link-title">
                    <SearchMatch query={query} semantic={false} text={title} />
                  </span>
                  <span className="sidebar-search-link-host">
                    <SearchMatch query={query} semantic={false} text={hostname} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <SearchPagination onPageChange={onPageChange} page={page} title={title} total={hits.length} />
    </section>
  );
};

const DocumentSearchSection = ({
  page,
  hits,
  onPageChange,
  onSelect,
  query,
}: {
  page: number | undefined;
  hits: AttachmentHit[];
  onPageChange: (page: number) => void;
  onSelect: (result: GlobalSearchResult) => void;
  query: string;
}) => {
  const visibleHits = getVisibleResults(hits, page, COLLAPSED_DOCUMENT_LIMIT);
  return (
    <section className="sidebar-search-section sidebar-search-documents" aria-labelledby="sidebar-documents-title">
      <SearchSectionHeader
        expanded={page !== undefined}
        hasMore={hits.length > COLLAPSED_DOCUMENT_LIMIT}
        id="sidebar-documents-title"
        onExpand={() => onPageChange(0)}
        title="Documents"
      />
      <ul className="sidebar-search-content-list">
        {visibleHits.map(({ attachment, parent }) => {
          const primary = getFileLabel(attachment);
          return (
            <li key={`${parent.message_id ?? parent.guid}-${attachment.attachment_id ?? primary}`}>
              <button
                type="button"
                data-search-result
                className="sidebar-search-content-button"
                aria-label={`Open ${primary} in conversation`}
                onClick={() => onSelect(parent)}
              >
                <span className="sidebar-search-content-icon" aria-hidden="true">
                  <ContentIcon kind="document" />
                </span>
                <span className="sidebar-search-content-copy">
                  <span className="sidebar-search-content-title">
                    <SearchMatch query={query} semantic={false} text={primary} />
                  </span>
                  <span className="sidebar-search-content-subtitle">{attachment.mime_type || "Document"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <SearchPagination onPageChange={onPageChange} page={page} title="Documents" total={hits.length} />
    </section>
  );
};

export const SidebarSearchResults = ({ conversations }: { conversations: Chat[] }) => {
  const {
    chatId,
    globalSearch,
    search,
    selectedSearchMessageId,
    setChatId,
    setIsComposingNewMessage,
    setMessageIdToBringToFocus,
    setSelectedSearchMessageId,
    useSemanticSearch,
  } = useMimessage(
    useShallow((state) => ({
      chatId: state.chatId,
      globalSearch: state.globalSearch || "",
      search: state.search || "",
      selectedSearchMessageId: state.selectedSearchMessageId,
      setChatId: state.setChatId,
      setIsComposingNewMessage: state.setIsComposingNewMessage,
      setMessageIdToBringToFocus: state.setMessageIdToBringToFocus,
      setSelectedSearchMessageId: state.setSelectedSearchMessageId,
      useSemanticSearch: state.useSemanticSearch,
    })),
  );
  const { data: results, isError, isLoading } = useGlobalSearch();
  const { data: homeDir } = useHomeDir();
  const chatMap = useChatMap();
  const handleMap = useHandleMap();
  const draftQuery = search.trim();
  const committedQuery = globalSearch.trim();
  const queryNeedsCommit = draftQuery !== committedQuery;
  const semanticQueryNeedsCommit = useSemanticSearch && queryNeedsCommit;

  const queryIdentity = `${useSemanticSearch ? "semantic" : "literal"}:${committedQuery}`;
  const [pagination, setPagination] = useState<{ query: string; pages: SearchPages }>(() => ({
    query: queryIdentity,
    pages: {},
  }));
  if (pagination.query !== queryIdentity) {
    setPagination({ query: queryIdentity, pages: {} });
  }
  const pages = pagination.query === queryIdentity ? pagination.pages : {};
  const setPage = (section: SearchSection, page: number) => {
    setPagination((current) => ({
      query: queryIdentity,
      pages: { ...(current.query === queryIdentity ? current.pages : {}), [section]: page },
    }));
  };

  const visibleConversations = useMemo(
    () => conversations.filter((chat) => chat.chat_id !== null).slice(0, CONVERSATION_LIMIT),
    [conversations],
  );
  const rawResults = queryNeedsCommit ? EMPTY_SEARCH_RESULTS : results || EMPTY_SEARCH_RESULTS;
  const messageResults = rawResults.filter((result) => result.text?.trim());
  const visibleMessageResults = getVisibleResults(messageResults, pages.messages, COLLAPSED_MESSAGE_LIMIT);
  const hasMoreMessages = pages.messages === undefined && messageResults.length > COLLAPSED_MESSAGE_LIMIT;
  const { documents, links, locations, photos } = useMemo(() => {
    const categorized = {
      documents: [] as AttachmentHit[],
      links: [] as LinkHit[],
      locations: [] as LinkHit[],
      photos: [] as AttachmentHit[],
    };
    if (useSemanticSearch || !committedQuery) {
      return categorized;
    }

    const normalizedQuery = committedQuery.toLocaleLowerCase();
    const seenAttachments = new Set<string>();
    const seenLinks = new Set<string>();
    for (const parent of rawResults) {
      const parentTextMatches = textMatchesQuery(parent.text, normalizedQuery);
      const attachments = [parent, ...(parent.attachmentMessages || [])] as GlobalSearchResult[];
      for (const attachment of attachments) {
        if (attachment.attachment_id === null && !attachment.filename && !attachment.mime_type) {
          continue;
        }
        const label = getFileLabel(attachment);
        if (!parentTextMatches && !label.toLocaleLowerCase().includes(normalizedQuery)) {
          continue;
        }
        const key = String(attachment.attachment_id ?? attachment.filename ?? `${parent.message_id}-${label}`);
        if (seenAttachments.has(key)) {
          continue;
        }
        seenAttachments.add(key);
        if (isPhotoAttachment(attachment)) {
          categorized.photos.push({ attachment, parent });
        } else if (isDocumentAttachment(attachment)) {
          categorized.documents.push({ attachment, parent });
        }
      }

      for (const url of extractHttpUrls(parent.text)) {
        if (!parentTextMatches && !url.toLocaleLowerCase().includes(normalizedQuery)) {
          continue;
        }
        const key = `${parent.message_id ?? parent.guid}-${url}`;
        if (!seenLinks.has(key)) {
          seenLinks.add(key);
          categorized[isLocationUrl(url) ? "locations" : "links"].push({ parent, url });
        }
      }
    }
    return categorized;
  }, [committedQuery, rawResults, useSemanticSearch]);
  const hasAnyResults =
    visibleConversations.length > 0 ||
    messageResults.length > 0 ||
    photos.length > 0 ||
    links.length > 0 ||
    locations.length > 0 ||
    documents.length > 0;

  const selectConversation = (chat: Chat) => {
    if (chat.chat_id === null) {
      return;
    }
    setMessageIdToBringToFocus(null);
    setSelectedSearchMessageId(null);
    setIsComposingNewMessage(false);
    setChatId(chat.chat_id);
  };

  const selectMessage = (result: GlobalSearchResult) => {
    if (result.chat_id === null || result.message_id === null) {
      return;
    }
    setSelectedSearchMessageId(result.message_id);
    setMessageIdToBringToFocus(result.message_id);
    setIsComposingNewMessage(false);
    setChatId(result.chat_id);
  };

  if (!draftQuery && !committedQuery) {
    return (
      <div className="sidebar-search-empty sidebar-search-empty-initial" role="status">
        Search conversations and messages
      </div>
    );
  }

  return (
    <div
      className="sidebar-search-results"
      aria-busy={(isLoading || queryNeedsCommit) && !semanticQueryNeedsCommit}
      aria-label="Search results"
      onKeyDown={moveSearchResultFocus}
    >
      {visibleConversations.length ? (
        <section
          className="sidebar-search-section sidebar-search-conversations"
          aria-labelledby="sidebar-conversations-title"
        >
          <h2 className="sidebar-search-section-title" id="sidebar-conversations-title">
            Conversations
          </h2>
          <ul className="sidebar-search-conversation-rail">
            {visibleConversations.map((chat) => (
              <ConversationResult
                key={chat.chat_id}
                chat={chat}
                onSelect={selectConversation}
                query={draftQuery}
                selected={chatId === chat.chat_id}
                semantic={useSemanticSearch}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {semanticQueryNeedsCommit ? (
        <p className="sidebar-search-status" role="status">
          Press Return to search by meaning
        </p>
      ) : queryNeedsCommit ? (
        <div className="sidebar-search-loading" role="status">
          <progress className="sidebar-search-progress" aria-label="Searching messages" />
          <span>Searching…</span>
        </div>
      ) : isError ? (
        <p className="sidebar-search-status sidebar-search-error" role="alert">
          Search is temporarily unavailable
        </p>
      ) : isLoading && !rawResults.length ? (
        <div className="sidebar-search-loading" role="status">
          <progress className="sidebar-search-progress" aria-label="Searching messages" />
          <span>Searching…</span>
        </div>
      ) : messageResults.length ? (
        <section className="sidebar-search-section sidebar-search-messages" aria-labelledby="sidebar-messages-title">
          <header className="sidebar-search-section-header">
            <h2 className="sidebar-search-section-title" id="sidebar-messages-title">
              Messages
            </h2>
            {hasMoreMessages ? (
              <button type="button" className="sidebar-search-show-more" onClick={() => setPage("messages", 0)}>
                Show More
              </button>
            ) : null}
          </header>
          <ul className="sidebar-search-message-list">
            {visibleMessageResults.map((result) => (
              <MessageResult
                key={result.message_id ?? result.guid}
                chat={chatMap.get(result.chat_id!)}
                handleMap={handleMap}
                onSelect={selectMessage}
                query={committedQuery}
                result={result}
                selected={selectedSearchMessageId === result.message_id}
                semantic={useSemanticSearch}
              />
            ))}
          </ul>
          <SearchPagination
            onPageChange={(page) => setPage("messages", page)}
            page={pages.messages}
            title="Messages"
            total={messageResults.length}
          />
        </section>
      ) : null}

      {links.length ? (
        <LinkSearchSection
          chatMap={chatMap}
          page={pages.links}
          handleMap={handleMap}
          hits={links}
          homeDir={homeDir}
          onPageChange={(page) => setPage("links", page)}
          onSelect={selectMessage}
          query={committedQuery}
        />
      ) : null}

      {photos.length ? (
        <PhotoSearchSection
          chatMap={chatMap}
          page={pages.photos}
          handleMap={handleMap}
          hits={photos}
          homeDir={homeDir}
          onPageChange={(page) => setPage("photos", page)}
          onSelect={selectMessage}
        />
      ) : null}

      {locations.length ? (
        <LinkSearchSection
          chatMap={chatMap}
          page={pages.locations}
          handleMap={handleMap}
          hits={locations}
          homeDir={homeDir}
          onPageChange={(page) => setPage("locations", page)}
          onSelect={selectMessage}
          query={committedQuery}
          sectionKey="locations"
          title="Locations"
        />
      ) : null}

      {documents.length ? (
        <DocumentSearchSection
          page={pages.documents}
          hits={documents}
          onPageChange={(page) => setPage("documents", page)}
          onSelect={selectMessage}
          query={committedQuery}
        />
      ) : null}

      {!queryNeedsCommit && !isError && !isLoading && !hasAnyResults ? (
        <div className="sidebar-search-empty sidebar-search-empty-no-results" role="status">
          No Results
        </div>
      ) : null}
    </div>
  );
};
