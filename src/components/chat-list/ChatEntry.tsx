import type { Chat } from "../../interfaces";
import { useMimessage } from "../../context";
import Box from "@mui/material/Box";
import { MessageAvatar } from "../message/Avatar";
import Typography from "@mui/material/Typography";
import React from "react";
import type { Contact } from "electron-mac-contacts";
import { CHAT_LIST_WIDTH } from "./ChatList";

export const CHAT_HEIGHT = 65;

interface ChatEntryProps {
  style?: React.CSSProperties;
  chat: Chat;
}

const ChatEntryRenderer = ({
  name,
  contact,
  text,
  isSelected,
  onClick,
  style,
}: {
  name: string;
  isSelected: boolean;
  onClick: () => void;
  text?: string | undefined | null;
  contact?: Contact | null | undefined;
  style?: React.CSSProperties;
}) => {
  const isInWrapped = useMimessage((state) => state.isInWrapped);

  return (
    <Box
      sx={{
        background: isSelected ? "#148aff" : undefined,
        display: "flex",
        flexDirection: "row",
        py: 1,
        px: 2,
        mx: 1,
        cursor: "pointer",
        width: CHAT_LIST_WIDTH - 16,
        height: CHAT_HEIGHT,
        minHeight: CHAT_HEIGHT,
        overflow: "hidden",
        borderRadius: 1,
        alignItems: "center",
      }}
      style={style}
      onClick={onClick}
    >
      <Box sx={{ mr: 1 }}>
        <MessageAvatar contact={contact} fallback={name} />
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "inline-flex", whiteSpace: "pre", textOverflow: "ellipsis", alignItems: "center" }}>
          <Typography sx={{ textOverflow: "ellipsis", fontWeight: "bold", display: "inline-flex" }} variant={"h5"}>
            {name}
          </Typography>
          {isInWrapped && (
            <Box className={"glow"} sx={{ ml: 0.5, fontStyle: "italic", display: "inline-flex" }}>
              Wrapped
            </Box>
          )}
        </Box>
        {text && (
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
            {text}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export const ChatEntry = ({ chat, style }: ChatEntryProps) => {
  const chatId = useMimessage((state) => state.chatId);
  const setChatId = useMimessage((state) => state.setChatId);
  const setGlobalSearch = useMimessage((state) => state.setGlobalSearch);

  const handles = chat.handles || [];
  const name = chat.name;
  const isSingleConvo = handles.length === 1;
  const isSelected = chatId === chat.chat_id;

  return (
    <ChatEntryRenderer
      style={style}
      isSelected={isSelected}
      onClick={() => {
        if (isSelected) {
          setChatId(null);
        } else {
          setChatId(chat.chat_id!);
          setGlobalSearch(null);
        }
      }}
      contact={isSingleConvo ? handles[0].contact : null}
      name={name}
      text={chat?.text}
    />
  );
};
