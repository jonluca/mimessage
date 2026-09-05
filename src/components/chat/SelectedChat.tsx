import React, { useRef, useState } from "react";
import { useMimessage } from "../../context";
import type { ChatListAggregate, MessageHistoryOrigin } from "../../hooks/dataHooks";
import { useChatById, useHandleMap, useMessagesForChatId } from "../../hooks/dataHooks";
import type { Message, MessagePageBoundaryContext } from "../../interfaces";
import { getLocalMessageIndex, getTranscriptItemKey, MESSAGE_VIRTUAL_INDEX_BASE } from "../../utils/message-pagination";
import { AiMessageBubble, hasMessageDateDivider, MessageBubble } from "../message/MessageBubble";
import { SendMessageBox } from "./SendMessageBox";
import { SelectedChatFilterBar } from "./SelectedChatFilterBar";
import type { FlatIndexLocationWithAlign, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { useShallow } from "zustand/react/shallow";
import { ErrorBoundary } from "../ErrorBoundary";
import { ConversationDetails, type ConversationDetailsAction } from "./ConversationDetails";
import { ExportChat } from "./ExportChat";

const isStoredMessage = (message: ChatListAggregate[number] | undefined): message is Message =>
  Boolean(message && !("role" in message) && !("divider" in message));

const belongsToSameBubbleGroup = (
  first: MessagePageBoundaryContext | Message | null | undefined,
  second: MessagePageBoundaryContext | Message | null | undefined,
) =>
  Boolean(
    first &&
    second &&
    Boolean(first.is_from_me) === Boolean(second.is_from_me) &&
    first.handle_id === second.handle_id &&
    first.service === second.service &&
    first.item_type === 0 &&
    second.item_type === 0 &&
    !hasMessageDateDivider(first, second),
  );

const getFocusedMessageIndex = (messages: ChatListAggregate, messageId: number | null) =>
  messageId ? messages.findIndex((message) => "message_id" in message && message.message_id === messageId) : -1;

interface TranscriptScrollAnchor {
  historyKey: string;
  interactionVersion: number;
  messageId: number;
  offset: number;
}

const findRenderedMessage = (scroller: HTMLElement, messageId: number) =>
  Array.from(scroller.querySelectorAll<HTMLElement>(".message-transcript-item[data-message-id]")).find(
    (item) => item.dataset.messageId === String(messageId),
  );

export const SelectedChat = () => {
  const { chatId, filter, messageIdToBringToFocus, regexSearch, setFilter, setMessageIdToBringToFocus } = useMimessage(
    useShallow((state) => ({
      chatId: state.chatId,
      filter: state.filter,
      messageIdToBringToFocus: state.messageIdToBringToFocus,
      regexSearch: state.regexSearch,
      setFilter: state.setFilter,
      setMessageIdToBringToFocus: state.setMessageIdToBringToFocus,
    })),
  );
  const [historyOriginState, setHistoryOriginState] = useState(() => ({
    chatId,
    origin: messageIdToBringToFocus as MessageHistoryOrigin,
  }));
  const historyOrigin = historyOriginState.chatId === chatId ? historyOriginState.origin : messageIdToBringToFocus;
  const setHistoryOrigin = React.useCallback(
    (origin: MessageHistoryOrigin) => {
      setHistoryOriginState({ chatId, origin });
    },
    [chatId],
  );
  const [showTimes, setShowTimes] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(Boolean(filter));
  const virtuoso = useRef<VirtuosoHandle>(null);
  const historyScroller = useRef<HTMLElement | null>(null);
  const activePageLoad = useRef<{ direction: "newer" | "older"; historyKey: string } | null>(null);
  const isAtBottom = useRef(true);
  const followingAiOutput = useRef(false);
  const previousAiState = useRef({ chatId, count: 0, signature: "" });
  const transcriptInteractionVersion = useRef(0);
  const effectiveHistoryOrigin = messageIdToBringToFocus ?? historyOrigin;
  const historyOriginKey =
    typeof effectiveHistoryOrigin === "number"
      ? `anchor:${effectiveHistoryOrigin}`
      : effectiveHistoryOrigin || "latest";
  const historyKey = `chat:${chatId ?? "none"}:${historyOriginKey}`;
  const searchKey = `chat:${chatId ?? "none"}:search:${regexSearch ? "regex" : "literal"}:${filter?.trim() || ""}`;
  const historyPaginationState = useRef({ atTop: false, historyKey, ready: false });
  const currentHistoryKey = useRef(historyKey);

  React.useLayoutEffect(() => {
    currentHistoryKey.current = historyKey;
  }, [historyKey]);

  const chat = useChatById(chatId);
  const handleMap = useHandleMap();
  const {
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    historyData,
    historyError,
    isFetchingHistory,
    isFetchingNextPage,
    isFetchingPreviousPage,
    isHistoryLoading,
    isSearching,
    isSearchLoading,
    newestSuccessor,
    oldestPredecessor,
    prependedMessageCount,
    searchData,
    searchError,
    visibleAiMessages,
  } = useMessagesForChatId(chatId, effectiveHistoryOrigin);

  const historyFirstItemIndex = MESSAGE_VIRTUAL_INDEX_BASE - prependedMessageCount;
  const searchFirstItemIndex = MESSAGE_VIRTUAL_INDEX_BASE;
  const historyCount = historyData.length;
  const searchCount = searchData.length;
  const isMultiMemberChat = (chat?.handles?.length || 0) > 1;
  const focusedMessageIndex = getFocusedMessageIndex(historyData, messageIdToBringToFocus);
  const lastAiMessage = visibleAiMessages.at(-1);
  const lastAiMessageSignature = lastAiMessage
    ? `${lastAiMessage.requestId || ""}:${lastAiMessage.role}:${lastAiMessage.pending ? "pending" : "done"}:${lastAiMessage.content.length}`
    : "";

  React.useEffect(() => {
    const previous = previousAiState.current;
    if (previous.chatId !== chatId) {
      previousAiState.current = { chatId, count: visibleAiMessages.length, signature: lastAiMessageSignature };
      followingAiOutput.current = false;
      isAtBottom.current = true;
      return;
    }

    if (visibleAiMessages.length > previous.count && isAtBottom.current) {
      followingAiOutput.current = true;
    }
    const outputChanged = previous.signature !== lastAiMessageSignature;
    previousAiState.current = { chatId, count: visibleAiMessages.length, signature: lastAiMessageSignature };
    if (!outputChanged || !followingAiOutput.current || isSearching || !historyCount) {
      return;
    }

    window.requestAnimationFrame(() => {
      virtuoso.current?.scrollToIndex({
        align: "end",
        behavior: "auto",
        index: historyFirstItemIndex + historyCount - 1,
      });
      if (!lastAiMessage?.pending) {
        followingAiOutput.current = false;
      }
    });
  }, [
    chatId,
    historyCount,
    historyFirstItemIndex,
    isSearching,
    lastAiMessage?.pending,
    lastAiMessageSignature,
    visibleAiMessages.length,
  ]);

  React.useEffect(() => {
    if (
      typeof effectiveHistoryOrigin === "number" &&
      !isHistoryLoading &&
      !isFetchingHistory &&
      getFocusedMessageIndex(historyData, effectiveHistoryOrigin) === -1
    ) {
      setHistoryOrigin(null);
      setMessageIdToBringToFocus(null);
    }
  }, [
    effectiveHistoryOrigin,
    historyData,
    isFetchingHistory,
    isHistoryLoading,
    setHistoryOrigin,
    setMessageIdToBringToFocus,
  ]);

  React.useEffect(() => {
    const virt = virtuoso.current;
    if (!virt || !messageIdToBringToFocus || focusedMessageIndex < 0) {
      return;
    }

    const index = historyFirstItemIndex + focusedMessageIndex;
    virt.scrollToIndex({ index, align: "center" });
    const retry = window.setTimeout(() => {
      virt.scrollToIndex({ index, align: "center" });
    }, 100);
    const timeout = window.setTimeout(() => {
      setHistoryOrigin(messageIdToBringToFocus);
      setMessageIdToBringToFocus(null);
    }, 300);

    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(timeout);
    };
  }, [
    focusedMessageIndex,
    historyFirstItemIndex,
    messageIdToBringToFocus,
    setHistoryOrigin,
    setMessageIdToBringToFocus,
  ]);

  const renderTranscriptItem = React.useCallback(
    (
      messages: ChatListAggregate,
      firstItemIndex: number,
      virtualIndex: number,
      message: ChatListAggregate[number],
      boundaryContext?: {
        newestSuccessor: MessagePageBoundaryContext | null;
        oldestPredecessor: MessagePageBoundaryContext | null;
      },
    ) => {
      const index = getLocalMessageIndex(virtualIndex, firstItemIndex);
      const previousItem = messages[index - 1];
      const nextItem = messages[index + 1];

      if (!message) {
        return null;
      }

      if ("divider" in message) {
        return (
          <div className="message-transcript-item">
            <div data-index={index} className="ai-conversation-divider" role="separator" aria-label="AI conversation">
              <hr className="ai-conversation-divider-line" />
              <span className="ai-conversation-divider-label">AI conversation</span>
              <hr className="ai-conversation-divider-line" />
            </div>
          </div>
        );
      }

      const isAiMessage = "role" in message;
      const previousMessage = isStoredMessage(previousItem)
        ? previousItem
        : index === 0
          ? boundaryContext?.oldestPredecessor
          : null;
      const nextMessage = isStoredMessage(nextItem)
        ? nextItem
        : index === messages.length - 1
          ? boundaryContext?.newestSuccessor
          : null;
      return (
        <div
          data-index={index}
          data-message-id={"message_id" in message ? message.message_id : undefined}
          className={`message-transcript-item${isAiMessage ? " is-ai-message" : ""}`}
        >
          {isAiMessage ? (
            <AiMessageBubble message={message} showTimes={showTimes} />
          ) : (
            <MessageBubble
              handleMap={handleMap}
              showAvatar={isMultiMemberChat}
              message={message}
              previousMessage={previousMessage}
              showTimes={showTimes}
              isGroupedMessage={belongsToSameBubbleGroup(previousMessage, message)}
              isLastInGroup={!belongsToSameBubbleGroup(message, nextMessage)}
              isLastInTranscript={boundaryContext?.newestSuccessor === null && nextMessage === null}
            />
          )}
        </div>
      );
    },
    [handleMap, isMultiMemberChat, showTimes],
  );
  const historyItemRenderer = React.useCallback(
    (index: number, message: ChatListAggregate[number]) =>
      renderTranscriptItem(historyData, historyFirstItemIndex, index, message, {
        newestSuccessor,
        oldestPredecessor,
      }),
    [historyData, historyFirstItemIndex, newestSuccessor, oldestPredecessor, renderTranscriptItem],
  );
  const searchItemRenderer = React.useCallback(
    (index: number, message: ChatListAggregate[number]) =>
      renderTranscriptItem(searchData, searchFirstItemIndex, index, message),
    [renderTranscriptItem, searchData, searchFirstItemIndex],
  );

  const historyInitialTargetIndex = React.useMemo(() => {
    if (effectiveHistoryOrigin === "oldest") {
      return 0;
    }
    const anchorIndex =
      typeof effectiveHistoryOrigin === "number"
        ? getFocusedMessageIndex(historyData, effectiveHistoryOrigin)
        : focusedMessageIndex;
    return anchorIndex >= 0 ? anchorIndex : Math.max(historyCount - 1, 0);
  }, [effectiveHistoryOrigin, focusedMessageIndex, historyCount, historyData]);
  const historyInitialTopMostItemIndex = React.useMemo<FlatIndexLocationWithAlign | number>(
    () =>
      effectiveHistoryOrigin === "oldest"
        ? historyFirstItemIndex
        : {
            align: typeof effectiveHistoryOrigin === "number" ? "center" : "end",
            index: historyFirstItemIndex + historyInitialTargetIndex,
          },
    [effectiveHistoryOrigin, historyFirstItemIndex, historyInitialTargetIndex],
  );

  const jumpToBoundary = React.useCallback(
    (position: "latest" | "oldest") => {
      setSearchOpen(false);
      setFilter(null);
      const nextOrigin = position === "oldest" ? "oldest" : null;
      setMessageIdToBringToFocus(null);
      if (effectiveHistoryOrigin !== nextOrigin) {
        setHistoryOrigin(nextOrigin);
        return;
      }
      const localIndex = position === "oldest" ? 0 : Math.max(historyCount - 1, 0);
      virtuoso.current?.scrollToIndex({
        index: historyFirstItemIndex + localIndex,
        align: position === "oldest" ? "start" : "end",
        behavior: "auto",
      });
    },
    [
      effectiveHistoryOrigin,
      historyCount,
      historyFirstItemIndex,
      setFilter,
      setHistoryOrigin,
      setMessageIdToBringToFocus,
    ],
  );

  const capturePrependAnchor = React.useCallback((): TranscriptScrollAnchor | null => {
    const scroller = historyScroller.current;
    const firstMessage = historyData.find(isStoredMessage);
    if (!scroller || !firstMessage || !Number.isSafeInteger(firstMessage.message_id)) {
      return null;
    }
    const item = findRenderedMessage(scroller, firstMessage.message_id);
    if (!item) {
      return null;
    }
    return {
      historyKey,
      interactionVersion: transcriptInteractionVersion.current,
      messageId: firstMessage.message_id,
      offset: item.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
    };
  }, [historyData, historyKey]);

  const restorePrependAnchor = React.useCallback(
    async (anchor: TranscriptScrollAnchor, pageLoad: { direction: "older"; historyKey: string }): Promise<void> => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });

      for (const delay of [0, 50, 150]) {
        if (delay) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
        }
        if (
          activePageLoad.current !== pageLoad ||
          currentHistoryKey.current !== anchor.historyKey ||
          transcriptInteractionVersion.current !== anchor.interactionVersion
        ) {
          return;
        }
        const scroller = historyScroller.current;
        const item = scroller ? findRenderedMessage(scroller, anchor.messageId) : undefined;
        if (!scroller || !item) {
          continue;
        }
        const currentOffset = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        const correction = currentOffset - anchor.offset;
        if (Math.abs(correction) > 0.5) {
          scroller.scrollTop += correction;
        }
      }
    },
    [],
  );

  const loadPreviousPage = React.useCallback(async () => {
    if (!hasPreviousPage || isFetchingHistory || activePageLoad.current?.historyKey === historyKey) {
      return;
    }
    const pageLoad = { direction: "older" as const, historyKey };
    const anchor = capturePrependAnchor();
    activePageLoad.current = pageLoad;
    try {
      await fetchPreviousPage({ cancelRefetch: false });
      if (anchor) {
        await restorePrependAnchor(anchor, pageLoad);
      }
    } finally {
      if (activePageLoad.current === pageLoad) {
        activePageLoad.current = null;
      }
    }
  }, [capturePrependAnchor, fetchPreviousPage, hasPreviousPage, historyKey, isFetchingHistory, restorePrependAnchor]);

  const loadNextPage = React.useCallback(async () => {
    if (!hasNextPage || isFetchingHistory || activePageLoad.current?.historyKey === historyKey) {
      return;
    }
    const pageLoad = { direction: "newer" as const, historyKey };
    activePageLoad.current = pageLoad;
    try {
      await fetchNextPage({ cancelRefetch: false });
    } finally {
      if (activePageLoad.current === pageLoad) {
        activePageLoad.current = null;
      }
    }
  }, [fetchNextPage, hasNextPage, historyKey, isFetchingHistory]);

  const historyEmptyMessage = historyError instanceof Error ? historyError.message : "No Messages";
  const searchEmptyMessage = searchError instanceof Error ? searchError.message : "No matching messages";
  const showLoading = isSearching ? isSearchLoading : isHistoryLoading || isFetchingPreviousPage || isFetchingNextPage;

  const handleDetailsAction = (action: ConversationDetailsAction) => {
    if (action === "timestamps") {
      setShowTimes((value) => !value);
    } else if (action === "search") {
      setSearchOpen((value) => {
        if (value) {
          setFilter(null);
        }
        return !value;
      });
    } else if (action === "first" || action === "latest") {
      jumpToBoundary(action === "first" ? "oldest" : "latest");
    } else if (action === "export") {
      setExportOpen(true);
    }
  };

  return (
    <main className={`conversation-pane${detailsOpen ? " has-details" : ""}`}>
      <ErrorBoundary>
        {exportOpen && <ExportChat onClose={() => setExportOpen(false)} />}
        <div className="conversation-thread">
          <SelectedChatFilterBar
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((value) => !value)}
            searchOpen={searchOpen}
          />
          {showLoading && <progress className="thread-loading-bar" aria-label="Loading conversation" />}
          <div
            className="message-transcript"
            aria-busy={showLoading}
            onKeyDownCapture={() => {
              transcriptInteractionVersion.current += 1;
            }}
            onPointerDownCapture={() => {
              transcriptInteractionVersion.current += 1;
            }}
            onPointerMoveCapture={(event) => {
              if (event.buttons) {
                transcriptInteractionVersion.current += 1;
              }
            }}
            onTouchMoveCapture={() => {
              transcriptInteractionVersion.current += 1;
            }}
            onWheelCapture={() => {
              transcriptInteractionVersion.current += 1;
            }}
          >
            <div
              className="message-transcript-layer"
              role={isSearching ? undefined : "log"}
              aria-label={isSearching ? undefined : "Conversation transcript"}
              aria-hidden={isSearching || undefined}
              style={{ visibility: isSearching ? "hidden" : "visible", pointerEvents: isSearching ? "none" : "auto" }}
            >
              <Virtuoso
                key={historyKey}
                className="message-transcript-list"
                computeItemKey={getTranscriptItemKey}
                data={historyData}
                firstItemIndex={historyFirstItemIndex}
                initialTopMostItemIndex={historyInitialTopMostItemIndex}
                itemContent={historyItemRenderer}
                overscan={100}
                increaseViewportBy={{ top: 300, bottom: 600 }}
                ref={virtuoso}
                scrollerRef={(element) => {
                  historyScroller.current = element instanceof HTMLElement ? element : null;
                }}
                atBottomStateChange={(atBottom) => {
                  isAtBottom.current = atBottom;
                }}
                atTopStateChange={(atTop) => {
                  if (historyPaginationState.current.historyKey !== historyKey) {
                    historyPaginationState.current = { atTop: false, historyKey, ready: false };
                  }
                  const paginationState = historyPaginationState.current;
                  paginationState.atTop = atTop && historyCount > 0;
                  if (paginationState.atTop && paginationState.ready) {
                    void loadPreviousPage();
                  }
                }}
                rangeChanged={({ startIndex, endIndex }) => {
                  const initialTargetIndex = historyFirstItemIndex + historyInitialTargetIndex;
                  const targetIsVisible = startIndex <= initialTargetIndex && endIndex >= initialTargetIndex;
                  if (historyPaginationState.current.historyKey !== historyKey) {
                    historyPaginationState.current = { atTop: false, historyKey, ready: targetIsVisible };
                  } else if (targetIsVisible) {
                    historyPaginationState.current.ready = true;
                  }
                  if (targetIsVisible && historyPaginationState.current.atTop) {
                    void loadPreviousPage();
                  }
                }}
                endReached={() => {
                  void loadNextPage();
                }}
              />
              {!isHistoryLoading && !historyCount ? (
                <div className="empty-transcript message-transcript-empty-overlay">{historyEmptyMessage}</div>
              ) : null}
            </div>
            {isSearching ? (
              <div className="message-transcript-layer" role="log" aria-label="Conversation search results">
                {!isSearchLoading && searchCount ? (
                  <Virtuoso
                    key={searchKey}
                    className="message-transcript-list"
                    computeItemKey={getTranscriptItemKey}
                    data={searchData}
                    firstItemIndex={searchFirstItemIndex}
                    initialTopMostItemIndex={{ align: "end", index: searchFirstItemIndex + searchCount - 1 }}
                    itemContent={searchItemRenderer}
                    overscan={100}
                    increaseViewportBy={{ top: 300, bottom: 600 }}
                  />
                ) : null}
                {!isSearchLoading && !searchCount ? (
                  <div className="empty-transcript message-transcript-empty-overlay">{searchEmptyMessage}</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <SendMessageBox />
        </div>
        {detailsOpen ? (
          <ConversationDetails
            chat={chat ?? undefined}
            onAction={handleDetailsAction}
            onClose={() => setDetailsOpen(false)}
            showTimes={showTimes}
          />
        ) : null}
      </ErrorBoundary>
    </main>
  );
};
