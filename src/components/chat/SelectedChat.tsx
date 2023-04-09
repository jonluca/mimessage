import React, { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import { useChatById, useMessagesForChatId } from "../../hooks/dataHooks";
import { AiMessageBubble, MessageBubble } from "../message/MessageBubble";
import { Divider, LinearProgress } from "@mui/material";
import { SendMessageBox } from "./SendMessageBox";
import { FilterBar } from "./FilterBar";
import { useVirtualizer } from "../react-virtual";

export const SelectedChat = () => {
  const chatId = useMimessage((state) => state.chatId);
  const filter = useMimessage((state) => state.filter);
  const chat = useChatById(chatId);
  const { data: messages, isLoading } = useMessagesForChatId(chatId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTimes, setShowTimes] = useState(false);
  const count = messages?.length || 0;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: 80,
    overscan: 100,
  });

  const items = virtualizer.getVirtualItems();
  const hasItems = items && items.length > 0;

  const isMultiMemberChat = (chat?.handles?.length || 0) > 1;
  useEffect(() => {
    containerRef.current?.scrollTo(0, containerRef.current.scrollHeight);
  }, [chatId, count, virtualizer]);

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
        <FilterBar showTimes={showTimes} setShowTimes={setShowTimes} element={containerRef.current} />
      )}
      <Box
        ref={containerRef}
        style={{
          height: "100%",
          width: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          contain: "strict",
        }}
      >
        <Box
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {hasItems && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${items[0].start}px)`,
                p: 1,
              }}
            >
              {items.map((virtualRow) => {
                const message = messages?.[virtualRow.index];
                const previousMessage = messages?.[virtualRow.index - 1];

                if (!message) {
                  return null;
                }

                if ("divider" in message) {
                  return (
                    <Box key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                      <Divider sx={{ height: 3, my: 1, border: "0 none", background: "#2c2c2c" }} />
                    </Box>
                  );
                }

                return (
                  <Box key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                    {"role" in message ? (
                      <AiMessageBubble message={message} showTimes={showTimes} />
                    ) : (
                      <MessageBubble
                        showAvatar={isMultiMemberChat}
                        message={message}
                        previousMessage={
                          !previousMessage || "role" in previousMessage || "divider" in previousMessage
                            ? null
                            : previousMessage
                        }
                        showTimes={showTimes}
                        isGroupedMessage={
                          previousMessage &&
                          "handle_id" in previousMessage &&
                          message?.handle_id === previousMessage?.handle_id
                        }
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
      <SendMessageBox />
    </Box>
  );
};
