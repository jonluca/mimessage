import React, { useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import { useChatList } from "../hooks/dataHooks";
import type { VirtualItem } from "./react-virtual";
import { useVirtualizer } from "./react-virtual";
import type { Chat } from "../interfaces";
import Typography from "@mui/material/Typography";
import { useMimessage } from "../context";
import { shallow } from "zustand/shallow";
import { MessageAvatar } from "./Avatar";
import { SearchBar } from "./SearchBox";
import Fuse from "fuse.js";

export const CHAT_HEIGHT = 70;

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
      return contact?.parsedName;
    })
    .filter(Boolean);

  const name = chat.display_name || contactsInChat.join(", ") || chat.chat_identifier || "";
  const isSingleConvo = handles.length === 1;

  const isSelected = chatId === chat.chat_id;
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        p: 1,
        cursor: "pointer",
        position: "absolute",
        top: 0,
        width: "90%",
        height: CHAT_HEIGHT,
        transform: `translateY(${virtualRow.start}px)`,
        overflow: "hidden",
        background: isSelected ? "#148aff" : undefined,
        borderRadius: 2,
        alignItems: "center",
      }}
      onClick={() => {
        setChatId(chat.chat_id!);
      }}
    >
      <Box sx={{ mr: 1 }}>
        <MessageAvatar contact={isSingleConvo ? handles[0].contact : null} />
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Typography sx={{ textOverflow: "ellipsis", whiteSpace: "pre", fontWeight: "bold" }} variant={"h5"}>
          {name}
        </Typography>
        {chat && (
          <Typography
            sx={{
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              color: isSelected ? "white" : "#a8a8a8",
            }}
            variant={"body2"}
          >
            {chat.text}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export const ChatList = () => {
  const { data } = useChatList();
  const containerRef = useRef<HTMLDivElement>(null);
  const search = useMimessage((state) => state.search);

  const chatsToRender = useMemo(() => {
    if (search) {
      const fuse = new Fuse<Chat>(data || [], {
        keys: ["name", "code", "offer"],
        shouldSort: true,
        threshold: 0.2,
      });
      return fuse.search(search).map((l) => l.item) || [];
    }
    return data;
  }, [data, search]);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: chatsToRender?.length ?? 0,
    getScrollElement: () => containerRef.current!,
    estimateSize: () => CHAT_HEIGHT,
    overscan: 100,
  });
  const items = rowVirtualizer.getVirtualItems();

  return (
    <Box
      display={"flex"}
      sx={{
        display: "flex",
        overflowY: "auto",
        height: "100%",
        background: "#2c2c2c",
      }}
      flexDirection={"column"}
    >
      <SearchBar />
      <Box
        ref={containerRef}
        display={"flex"}
        sx={{
          display: "flex",
          overflowY: "auto",
          height: "100%",
          background: "#2c2c2c",
        }}
      >
        <Box
          sx={{
            display: "flex",
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: 400,
            position: "relative",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {items?.map((virtualRow) => {
            const chat = chatsToRender?.[virtualRow.index];
            if (!chat) {
              return null;
            }
            return <ChatEntry key={chat.guid} virtualRow={virtualRow} chat={chat} />;
          })}
        </Box>
      </Box>
    </Box>
  );
};
