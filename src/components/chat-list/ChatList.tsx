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

const VirtualizedList = ({ chats }: { chats: Chat[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const count = chats?.length ?? 0;
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count,
    getScrollElement: () => containerRef.current!,
    estimateSize: CHAT_HEIGHT,
    overscan: 100,
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
      key={count}
    >
      <Box
        sx={{
          ...CHAT_CONTAINER_STYLE,
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {items?.map((virtualRow) => {
          const chat = chats?.[virtualRow.index];
          if (!chat) {
            return null;
          }

          const style = {
            cursor: "pointer",
            position: "absolute",
            top: 0,
            transform: `translateY(${virtualRow.start}px)`,
          } as React.CSSProperties;
          return <ChatEntry key={`${chat.chat_id}-${virtualRow.index}`} style={style} chat={chat} />;
        })}
      </Box>
    </Box>
  );
};

export const ChatList = () => {
  const { data } = useChatList();
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

  const deduplicatedIndividualChats = useMemo(() => {
    const toExclude = new Set<number>();
    return chatsToRender
      .map((c) => {
        if (!c || toExclude.has(c.chat_id!)) {
          return null;
        }
        if (c.sameParticipantChatIds) {
          c.sameParticipantChatIds.forEach((id) => {
            toExclude.add(id);
          });
        }
        return c;
      })
      .filter(Boolean) as Chat[];
  }, [chatsToRender]);

  return (
    <ChatListWrapper>
      <SearchBar />
      <ImessageWrapped />
      <VirtualizedList key={deduplicatedIndividualChats.length} chats={deduplicatedIndividualChats} />
    </ChatListWrapper>
  );
};
