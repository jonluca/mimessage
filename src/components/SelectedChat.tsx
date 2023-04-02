import React from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../context";

export const SelectedChat = () => {
  const chatId = useMimessage((state) => state.chatId);
  return (
    <Box
      sx={{
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        width: "100%",
      }}
    >
      {chatId ? chatId : "No chat selected"}
    </Box>
  );
};
