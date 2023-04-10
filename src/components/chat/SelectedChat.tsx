import React, { useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import { useChatById, useMessagesForChatId } from "../../hooks/dataHooks";
import { AiMessageBubble, MessageBubble } from "../message/MessageBubble";
import { Divider, LinearProgress } from "@mui/material";
import { SendMessageBox } from "./SendMessageBox";
import { FilterBar } from "./FilterBar";
import type { FlatIndexLocationWithAlign, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { shallow } from "zustand/shallow";

export const SelectedChat = () => {
  const { chatId, filter, messageIdToBringToFocus, setMessageIdToBringToFocus } = useMimessage(
    (state) => ({
      setMessageIdToBringToFocus: state.setMessageIdToBringToFocus,
      messageIdToBringToFocus: state.messageIdToBringToFocus,
      chatId: state.chatId,
      filter: state.filter,
    }),
    shallow,
  );

  const chat = useChatById(chatId);
  const { data: messages, isLoading } = useMessagesForChatId(chatId);
  const [showTimes, setShowTimes] = useState(false);

  const virtuoso = useRef<VirtuosoHandle>(null);

  const count = messages?.length || 0;

  const hasItems = count > 0;

  const isMultiMemberChat = (chat?.handles?.length || 0) > 1;

  React.useEffect(() => {
    const virt = virtuoso.current;
    if (virt && messageIdToBringToFocus) {
      const index = messages?.findIndex(
        (message) => "message_id" in message && message.message_id === messageIdToBringToFocus,
      );
      if (index !== undefined && index !== -1) {
        virt?.scrollToIndex({ index, align: "center" });
        const interval = setInterval(() => {
          virt?.scrollToIndex({ index, align: "center" });
        }, 100);
        setTimeout(() => {
          clearInterval(interval);
          setMessageIdToBringToFocus(null);
        }, 1000);
      }
    }
  }, [messages, messageIdToBringToFocus]);

  const itemRenderer = (index: number) => {
    const message = messages?.[index];
    const previousMessage = messages?.[index - 1];

    if (!message) {
      return null;
    }

    if ("divider" in message) {
      return (
        <Box key={`divider-${index}`} data-index={index}>
          <Divider sx={{ height: 3, my: 1, border: "0 none", background: "#2c2c2c" }} />
        </Box>
      );
    }

    const isAiMessage = "role" in message;
    return (
      <Box key={`${isAiMessage ? message.content : message.chat_id}-${index}`} data-index={index}>
        {isAiMessage ? (
          <AiMessageBubble message={message} showTimes={showTimes} />
        ) : (
          <MessageBubble
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
  const showFilterBar = hasItems || filter;

  const initialTopMostItemIndex = messageIdToBringToFocus
    ? ({
        align: "center",
        index:
          messages?.findIndex((message) => "message_id" in message && message.message_id === messageIdToBringToFocus) ||
          0,
      } as FlatIndexLocationWithAlign)
    : count - 1;
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
      {showFilterBar && <FilterBar showTimes={showTimes} setShowTimes={setShowTimes} virtuoso={virtuoso} />}
      <Virtuoso
        totalCount={count}
        initialTopMostItemIndex={initialTopMostItemIndex}
        style={{ height: "100%" }}
        itemContent={itemRenderer}
        overscan={100}
        increaseViewportBy={2000}
        ref={virtuoso}
        followOutput={!messageIdToBringToFocus}
      />
      <SendMessageBox />
    </Box>
  );
};
