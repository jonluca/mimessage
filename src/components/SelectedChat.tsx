import React, { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../context";
import { useChatById, useMessagesForChatId } from "../hooks/dataHooks";
import { useVirtualizer } from "./react-virtual";
import { MessageBubble } from "./MessageBubble";
import { Checkbox, FormControlLabel, FormGroup, LinearProgress } from "@mui/material";

export const SelectedChat = () => {
  const chatId = useMimessage((state) => state.chatId);
  const chat = useChatById(chatId);
  const { data: messages, isLoading } = useMessagesForChatId(chatId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTimes, setShowTimes] = useState(false);
  const count = messages?.length || 0;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 80,
    overscan: 1000,
  });

  const items = virtualizer.getVirtualItems();
  const hasItems = items && items.length > 0;

  const isMultiMemberChat = (chat?.handles?.length || 0) > 1;
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
        background: "#1e1e1e",
      }}
    >
      {isLoading && <LinearProgress />}
      {hasItems && (
        <Box sx={{ display: "flex", flexDirection: "row" }}>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  style={{
                    color: "white",
                  }}
                  checked={showTimes}
                  onChange={() => setShowTimes((v) => !v)}
                />
              }
              label="Show timestamps"
            />
          </FormGroup>
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
              }}
            >
              {items.map((virtualRow) => {
                const message = messages?.[virtualRow.index];
                const previousMessage = messages?.[virtualRow.index - 1];
                return (
                  <Box key={virtualRow.key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                    <MessageBubble
                      showAvatar={isMultiMemberChat}
                      message={message}
                      showTimes={showTimes}
                      isGroupedMessage={message?.handle_id === previousMessage?.handle_id}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
