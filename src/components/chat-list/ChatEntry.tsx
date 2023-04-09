import type { Chat } from "../../interfaces";
import { useMimessage } from "../../context";
import Box from "@mui/material/Box";
import { MessageAvatar } from "../message/Avatar";
import Typography from "@mui/material/Typography";
import React, { useEffect, useRef } from "react";
import type { Contact } from "node-mac-contacts";

export const CHAT_HEIGHT = 65;

interface ChatEntryProps {
  setRowHeight: (num: number, height: number) => void;
  chat: Chat;
  index: number;
  style: React.CSSProperties;
}

export const ChatEntryRenderer = ({
  name,
  contact,
  text,
  isSelected,
  onClick,
  extraStyles,
}: {
  name: string;
  isSelected: boolean;
  onClick: () => void;
  text?: string | undefined | null;
  contact?: Contact | null | undefined;
  extraStyles?: React.CSSProperties;
}) => {
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
        width: "90%",
        height: CHAT_HEIGHT,
        minHeight: CHAT_HEIGHT,
        overflow: "hidden",
        borderRadius: 1,
        alignItems: "center",
        ...extraStyles,
      }}
      onClick={onClick}
    >
      <Box sx={{ mr: 1 }}>
        <MessageAvatar contact={contact} />
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
export const ChatEntry = ({ chat, style, index, setRowHeight }: ChatEntryProps) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const chatId = useMimessage((state) => state.chatId);
  const setChatId = useMimessage((state) => state.setChatId);

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

  useEffect(() => {
    if (rowRef.current) {
      setRowHeight(index, rowRef.current.clientHeight);
    }
    // eslint-disable-next-line
  }, [rowRef]);

  return (
    <ChatEntryRenderer
      extraStyles={style}
      isSelected={isSelected}
      onClick={() => {
        setChatId(chat.chat_id!);
      }}
      contact={isSingleConvo ? handles[0].contact : null}
      name={name}
      text={chat?.text}
    />
  );
};
