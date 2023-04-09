import React from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../context";
import { ChatList } from "./chat-list/ChatList";
import { SelectedChat } from "./chat/SelectedChat";
import { HighlightedMessage } from "./message/HighlightedMessage";

export const Home = () => {
  const chatId = useMimessage((state) => state.chatId);
  return (
    <Box
      display={"flex"}
      flexDirection={"row"}
      width={"100%"}
      height={"100%"}
      sx={{ background: "none", borderRadius: 1 }}
    >
      <ChatList />
      <SelectedChat key={chatId} />
      <HighlightedMessage />
    </Box>
  );
};
