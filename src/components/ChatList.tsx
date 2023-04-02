import React, { useRef } from "react";
import Box from "@mui/material/Box";
import { useChatList } from "../hooks/dataHooks";
import type { VirtualItem } from "./react-virtual";
import { useVirtualizer } from "./react-virtual";
import type { Chat } from "../interfaces";
import Typography from "@mui/material/Typography";
import { useMimessage } from "../context";
import { shallow } from "zustand/shallow";

const CHAT_HEIGHT = 80;

interface ChatEntryProps {
  virtualRow: VirtualItem;
  chat: Chat;
}

const ChatEntry = ({ chat, virtualRow }: ChatEntryProps) => {
  const { chatId, setChatId } = useMimessage(
    (state) => ({
      chatId: state.chatId,
      setChatId: state.setChatId,
    }),
    shallow,
  );
  const handles = chat.handles || [];
  const contactsInChat = (handles || [])
    .map((handle) => {
      const contact = handle.contact;
      if (!contact) {
        return "";
      }
      if (contact.nickname) {
        return contact.nickname;
      } else {
        if (contact.firstName || contact.lastName) {
          return `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
        }
      }

      return "";
    })
    .filter(Boolean);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        p: 1,
        m: 1,
        cursor: "pointer",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
        overflow: "hidden",
        border: "1px solid grey",
        background: chatId === chat.chat_id ? "grey" : undefined,
      }}
      onClick={() => {
        setChatId(chat.chat_id!);
      }}
    >
      <Typography sx={{ textOverflow: "ellipsis", whiteSpace: "pre", fontWeight: "bold" }} variant={"h5"}>
        {chat.display_name || contactsInChat.join(", ") || chat.chat_id}
      </Typography>
      {chat && (
        <Typography
          sx={{ WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}
          variant={"body2"}
        >
          {chat.text}
        </Typography>
      )}
    </Box>
  );
};

export const ChatList = () => {
  const { data } = useChatList();
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: data?.length ?? 0,
    getScrollElement: () => containerRef.current!,
    estimateSize: () => CHAT_HEIGHT,
    overscan: 40,
  });
  const items = rowVirtualizer.getVirtualItems();

  return (
    <Box
      ref={containerRef}
      display={"flex"}
      sx={{
        display: "flex",
        overflowY: "auto",
        height: "100%",
        background: "#2c2c2c",
      }}
      id={"grid-container"}
    >
      <Box
        sx={{
          display: "flex",
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: 400,
          position: "relative",
          flexDirection: "column",
        }}
      >
        {items?.map((virtualRow) => {
          const chat = data?.[virtualRow.index];
          if (!chat) {
            return null;
          }
          return <ChatEntry key={chat.guid} virtualRow={virtualRow} chat={chat} />;
        })}
      </Box>
    </Box>
  );
};
