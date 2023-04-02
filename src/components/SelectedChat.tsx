import React, { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../context";
import { useMessagesForChatId } from "../hooks/dataHooks";
import { useVirtualizer } from "./react-virtual";
import { MessageBubble } from "./MessageBubble";
import { LinearProgress } from "@mui/material";

export const SelectedChat = () => {
  const chatId = useMimessage((state) => state.chatId);
  const { data: messages, isLoading } = useMessagesForChatId(chatId);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = messages?.length || 0;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 80,
    overscan: 1000,
  });

  const items = virtualizer.getVirtualItems();
  const hasItems = items && items.length > 0;

  useEffect(() => {
    if (count) {
      virtualizer.scrollToIndex(count - 1, { align: "end" });
    }
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
        p: 2,
      }}
    >
      {isLoading && <LinearProgress />}
      {hasItems && (
        <Box sx={{ display: "flex", flexDirection: "row" }}>
          <button
            onClick={() => {
              virtualizer.scrollToIndex(0);
            }}
          >
            scroll to the top
          </button>
          <span style={{ padding: "0 4px" }} />
          <button
            onClick={() => {
              virtualizer.scrollToIndex(count / 2);
            }}
          >
            scroll to the middle
          </button>
          <span style={{ padding: "0 4px" }} />
          <button
            onClick={() => {
              virtualizer.scrollToIndex(count - 1);
            }}
          >
            scroll to the end
          </button>
        </Box>
      )}
      <Box
        ref={containerRef}
        style={{
          height: "100%",
          width: "100%",
          overflowY: "auto",
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
              }}
            >
              {items.map((virtualRow) => (
                <Box key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                  <MessageBubble message={messages?.[virtualRow.index]} />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
