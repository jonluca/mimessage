import React, { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import type { ChatListAggregate } from "../../hooks/dataHooks";
import { useChatById, useMessagesForChatId } from "../../hooks/dataHooks";
import { AiMessageBubble, MessageBubble } from "../message/MessageBubble";
import { Divider, LinearProgress } from "@mui/material";
import { SendMessageBox } from "./SendMessageBox";
import type { VariableSizeList } from "react-window";
import { VariableSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { FilterBar } from "./FilterBar";

const MessageRenderer = ({
  index,
  style,
  messages,
  setRowHeight,
  showTimes,
  isMultiMemberChat,
}: {
  showTimes: boolean;
  isMultiMemberChat: boolean;
  setRowHeight: (num: number, height: number) => void;
  index: number;
  style: React.CSSProperties;
  messages: ChatListAggregate | undefined;
}) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const message = messages?.[index];
  const previousMessage = messages?.[index - 1];

  const setHeight = React.useCallback(() => {
    if (rowRef.current) {
      setRowHeight(index, rowRef.current.scrollHeight);
    }
  }, [index, setRowHeight]);

  useEffect(() => {
    setHeight();
  }, [setHeight]);

  if (!message) {
    return null;
  }

  if ("divider" in message) {
    return (
      <Box key={`divider-${index}`} style={style} data-index={index} ref={rowRef}>
        <Divider sx={{ height: 3, my: 1, border: "0 none", background: "#2c2c2c" }} />
      </Box>
    );
  }

  const isAiMessage = "role" in message;
  return (
    <Box
      style={style}
      key={`message-${index}-${isAiMessage ? message.role : message.message_id}`}
      data-index={index}
      ref={rowRef}
    >
      {isAiMessage ? (
        <AiMessageBubble message={message} showTimes={showTimes} />
      ) : (
        <MessageBubble
          recalcSize={setHeight}
          showAvatar={isMultiMemberChat}
          message={message}
          previousMessage={
            !previousMessage || "role" in previousMessage || "divider" in previousMessage ? null : previousMessage
          }
          showTimes={showTimes}
          isGroupedMessage={
            previousMessage && "handle_id" in previousMessage && message?.handle_id === previousMessage?.handle_id
          }
        />
      )}
    </Box>
  );
};

export const SelectedChat = () => {
  const chatId = useMimessage((state) => state.chatId);
  const filter = useMimessage((state) => state.filter);
  const chat = useChatById(chatId);
  const { data: messages, isLoading } = useMessagesForChatId(chatId);
  const listRef = useRef<VariableSizeList>(null);
  const rowHeights = useRef<Record<number, number>>({});

  const [showTimes, setShowTimes] = useState(false);
  const count = messages?.length || 0;

  const setRowHeight = React.useCallback((index: number, size: number) => {
    rowHeights.current = { ...rowHeights.current, [index]: size };
    listRef.current!.resetAfterIndex(index);
  }, []);

  const getRowHeight = React.useCallback(
    (index: number) => {
      if (rowHeights.current[index]) {
        return rowHeights.current[index];
      }
      const message = messages?.[index];
      if (!message) {
        return 0;
      }
      if ("divider" in message) {
        return 20;
      }
      if ("filename" in message) {
        if (message.filename) {
          return 400;
        }
        return 33;
      }
      return 33;
    },
    [messages],
  );

  const hasItems = count > 0;

  const isMultiMemberChat = (chat?.handles?.length || 0) > 1;

  const scrollToEnd = React.useCallback(() => {
    // scroll to the end immediately, after 100ms, and after 1s, so that the heights are corect when images load
    listRef.current?.scrollToItem(count - 1, "end");
    setTimeout(() => listRef.current?.scrollToItem(count - 1, "end"), 100);
    setTimeout(() => listRef.current?.scrollToItem(count - 1, "end"), 1000);
  }, [count]);

  useEffect(() => {
    scrollToEnd();
  }, [chatId, scrollToEnd]);

  return (
    <Box
      sx={{
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        width: "100%",
        flexDirection: "column",
        background: "#1e1e1e",
      }}
    >
      {isLoading && <LinearProgress />}
      {(hasItems || filter) && (
        <FilterBar
          showTimes={showTimes}
          setShowTimes={setShowTimes}
          element={listRef.current}
          scrollToEnd={scrollToEnd}
        />
      )}
      <Box display={"block"} height={"100%"}>
        <AutoSizer>
          {({ height, width }) => (
            <List
              height={height!}
              itemCount={count}
              itemSize={getRowHeight}
              ref={listRef}
              width={width!}
              overscanCount={100}
            >
              {({ index, style }) => {
                return (
                  <MessageRenderer
                    isMultiMemberChat={isMultiMemberChat}
                    showTimes={showTimes}
                    index={index}
                    style={style}
                    messages={messages}
                    setRowHeight={setRowHeight}
                  />
                );
              }}
            </List>
          )}
        </AutoSizer>
      </Box>
      <SendMessageBox />
    </Box>
  );
};
