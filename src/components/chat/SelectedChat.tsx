import React, { useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import type { ChatListAggregate } from "../../hooks/dataHooks";
import { useChatById, useMessagesForChatId } from "../../hooks/dataHooks";
import { AiMessageBubble, MessageBubble } from "../message/MessageBubble";
import { Divider, LinearProgress } from "@mui/material";
import { SendMessageBox } from "./SendMessageBox";
import { SelectedChatFilterBar } from "./SelectedChatFilterBar";
import type { FlatIndexLocationWithAlign, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { shallow } from "zustand/shallow";
import { ErrorBoundary } from "../ErrorBoundary";

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
  }, [messages, messageIdToBringToFocus, setMessageIdToBringToFocus]);

  React.useEffect(() => {
    if (virtuoso.current) {
      virtuoso.current.scrollToIndex({ index: count - 1, align: "start" });
    }
  }, [count]);
  const itemRenderer = (index: number, message: ChatListAggregate[number]) => {
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
      <Box data-index={index} pb={isAiMessage ? 0.5 : 0}>
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
      <ErrorBoundary>
        {isLoading && <LinearProgress />}
        {showFilterBar && (
          <SelectedChatFilterBar showTimes={showTimes} setShowTimes={setShowTimes} virtuoso={virtuoso} />
        )}
        {count > 0 ? (
          <Box height={"100%"} display={"block"}>
            <Virtuoso
              data={messages}
              initialTopMostItemIndex={initialTopMostItemIndex}
              itemContent={itemRenderer}
              overscan={100}
              increaseViewportBy={2000}
              ref={virtuoso}
              followOutput={"auto"}
            />
          </Box>
        ) : (
          <Box height={"100%"} />
        )}
        <SendMessageBox />
      </ErrorBoundary>
    </Box>
  );
};
