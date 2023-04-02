import React from "react";
import Box from "@mui/material/Box";
import { useChatList, useContacts } from "../hooks/dataHooks";

export const ChatList = () => {
  const { data } = useChatList();
  const { data: contacts } = useContacts();
  return (
    <Box
      sx={{
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        flexDirection: "column",
        maxWidth: 400,
        width: 400,
      }}
    >
      {data?.map((chat) => {
        return (
          <Box
            sx={{
              display: "flex",
            }}
            key={chat.guid}
          >
            {chat.guid}
          </Box>
        );
      })}
    </Box>
  );
};
