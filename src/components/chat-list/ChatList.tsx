import React, { useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import { useChatList } from "../../hooks/dataHooks";
import type { Chat } from "../../interfaces";
import { useMimessage } from "../../context";
import { SearchBar } from "./SearchBox";
import Fuse from "fuse.js";
import { ImessageWrapped } from "./ImessageWrapped";
import { CHAT_HEIGHT, ChatEntry } from "./ChatEntry";
import { useVirtualizer } from "../react-virtual";

const CHAT_LIST_WIDTH = 320;
export const ChatListWrapper = ({ children }: React.PropsWithChildren) => {
  return (
    <Box
      className={"draggable"}
      display={"flex"}
      sx={{
        display: "flex",
        overflowY: "auto",
        height: "100%",
        background: "#313233",
        pt: 3,
        width: CHAT_LIST_WIDTH,
        minWidth: CHAT_LIST_WIDTH,
      }}
      flexDirection={"column"}
    >
      {children}
    </Box>
  );
};

export const CHAT_CONTAINER_STYLE = {
  display: "flex",
  position: "relative",
  flexDirection: "column",
  alignItems: "center",
  width: CHAT_LIST_WIDTH,
  minWidth: CHAT_LIST_WIDTH,
} as React.CSSProperties;

export const ChatList = () => {
  const { data } = useChatList();
  const containerRef = useRef<HTMLDivElement>(null);
  const search = useMimessage((state) => state.search);

  const chatsToRender = useMemo(() => {
    if (search) {
      const fuse = new Fuse<Chat>(data || [], {
        keys: [
          "display_name",
          "chat_identifier",
          "handles.contact.parsedName",
          "handles.contact.firstName",
          "handles.contact.emailAddresses",
          "handles.contact.phoneNumbers",
          "handles.contact.lastName",
        ],
        shouldSort: true,
        threshold: 0.2,
      });
      return fuse.search(search).map((l) => l.item) || [];
    }
    return data || [];
  }, [data, search]);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: chatsToRender?.length ?? 0,
    getScrollElement: () => containerRef.current!,
    estimateSize: CHAT_HEIGHT,
    overscan: 100,
  });
  const items = rowVirtualizer.getVirtualItems();

  return (
    <ChatListWrapper>
      <SearchBar />
      <ImessageWrapped />
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
            ...CHAT_CONTAINER_STYLE,
            height: `${rowVirtualizer.getTotalSize()}px`,
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
    </ChatListWrapper>
  );
};
