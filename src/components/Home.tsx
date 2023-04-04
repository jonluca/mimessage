import React from "react";
import Box from "@mui/material/Box";
import { NoSsr } from "@mui/material";
import { useMimessage } from "../context";
import { ChatList } from "./ChatList";
import { SelectedChat } from "./SelectedChat";
import { HighlightedMessage } from "./HighlightedMessage";

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
      <NoSsr>
        <ChatList />
      </NoSsr>
      <SelectedChat key={chatId} />
      <HighlightedMessage />
    </Box>
  );
};
