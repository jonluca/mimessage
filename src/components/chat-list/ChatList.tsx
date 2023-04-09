import React, { useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import { useChatList } from "../../hooks/dataHooks";
import type { Chat } from "../../interfaces";
import { useMimessage } from "../../context";
import { SearchBar } from "./SearchBox";
import Fuse from "fuse.js";
import { ImessageWrapped } from "./ImessageWrapped";
import { CHAT_HEIGHT, ChatEntry } from "./ChatEntry";
import type { VariableSizeList } from "react-window";
import { VariableSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";

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
  height: "100%",
  width: CHAT_LIST_WIDTH,
  minWidth: CHAT_LIST_WIDTH,
} as React.CSSProperties;

export const ChatList = () => {
  const { data } = useChatList();
  const search = useMimessage((state) => state.search);
  const listRef = useRef<VariableSizeList>(null);
  const rowHeights = useRef<Record<number, number>>({});

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

  // References

  const setRowHeight = React.useCallback((index: number, size: number) => {
    rowHeights.current[index] = size;
  }, []);

  const getRowHeight = React.useCallback((index: number) => rowHeights.current[index] ?? CHAT_HEIGHT, []);

  return (
    <ChatListWrapper>
      <SearchBar />
      <ImessageWrapped />
      <Box display={"block"} height={"100%"}>
        <AutoSizer style={CHAT_CONTAINER_STYLE}>
          {({ height, width }) => (
            <List
              height={height!}
              itemCount={chatsToRender.length}
              itemSize={getRowHeight}
              ref={listRef}
              width={width!}
              overscanCount={100}
            >
              {({ index, style }) => {
                const chat = chatsToRender?.[index];
                if (!chat) {
                  return null;
                }
                return (
                  <ChatEntry key={chat.guid} style={style} index={index} setRowHeight={setRowHeight} chat={chat} />
                );
              }}
            </List>
          )}
        </AutoSizer>
      </Box>
    </ChatListWrapper>
  );
};
