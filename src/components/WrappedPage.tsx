import React from "react";
import Box from "@mui/material/Box";
import { NoSsr } from "@mui/material";
import { useMimessage } from "../context";
import { SelectedChat } from "./chat/SelectedChat";
import { HighlightedMessage } from "./message/HighlightedMessage";
import { WrappedList } from "./wrapped/WrappedList";

export const WrappedPage = () => {
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
        <WrappedList />
      </NoSsr>
      <SelectedChat key={chatId} />
      <HighlightedMessage />
    </Box>
  );
};
