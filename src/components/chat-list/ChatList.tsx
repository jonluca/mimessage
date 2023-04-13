import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import { useChatList } from "../../hooks/dataHooks";
import type { Chat } from "../../interfaces";
import { useMimessage } from "../../context";
import { SearchBar } from "./SearchBox";
import Fuse from "fuse.js";
import { ImessageWrapped } from "./ImessageWrapped";
import { ChatEntry } from "./ChatEntry";
import { Virtuoso } from "react-virtuoso";
import { YearSelector } from "../wrapped/YearSelector";

export const CHAT_LIST_WIDTH = 320;
export const ChatListWrapper = ({ children }: React.PropsWithChildren) => {
  return (
    <Box
      className={"draggable"}
      display={"flex"}
      sx={{
        display: "flex",
        overflowY: "auto",
        overflowX: "hidden",
        height: "100%",
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
  const count = chats?.length ?? 0;

  const itemContent = (index: number, chat: Chat) => {
    if (!chat) {
      return null;
    }

    return <ChatEntry chat={chat} />;
  };

  if (!count) {
    return null;
  }
  return (
    <Virtuoso
      increaseViewportBy={2000}
      style={{ height: "100%" }}
      data={chats}
      itemContent={itemContent}
      overscan={100}
    />
  );
};

export const ChatList = () => {
  const { data } = useChatList();
  const search = useMimessage((state) => state.search);
  const isInWrapped = useMimessage((state) => state.isInWrapped);
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
      {isInWrapped ? <YearSelector /> : <SearchBar />}
      <ImessageWrapped back={isInWrapped} />
      <VirtualizedList key={deduplicatedIndividualChats.length} chats={deduplicatedIndividualChats} />
    </ChatListWrapper>
  );
};
