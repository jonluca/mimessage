import React, { useRef } from "react";
import Box from "@mui/material/Box";
import { useChatList, useContactMap } from "../hooks/dataHooks";
import type { VirtualItem } from "./react-virtual";
import { useVirtualizer } from "./react-virtual";
import type { Chat } from "../interfaces";
import type { Contact } from "node-mac-contacts";

const CHAT_HEIGHT = 60;

interface ChatEntryProps {
  virtualRow: VirtualItem;
  chat: Chat;
  contact: Contact | undefined;
}

const ChatEntry = ({ chat, contact, virtualRow }: ChatEntryProps) => {
  let name = chat.chat_identifier;
  if (contact) {
    if (contact.nickname) {
      name = contact.nickname;
    } else {
      if (contact.firstName || contact.lastName) {
        name = `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
      }
    }
  }
  return (
    <Box
      sx={{
        display: "flex",
        p: 1,
        m: 1,
        cursor: "pointer",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      {chat.display_name || name}
    </Box>
  );
};

export const ChatList = () => {
  const { data } = useChatList();
  const { data: contacts } = useContactMap();
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
          const contact = contacts?.get(chat.chat_identifier);
          return <ChatEntry key={chat.guid} virtualRow={virtualRow} chat={chat} contact={contact} />;
        })}
      </Box>
    </Box>
  );
};
