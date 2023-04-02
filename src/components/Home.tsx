import React from "react";
import Box from "@mui/material/Box";
import { NoSsr } from "@mui/material";
import { useMimessage } from "../context";
import { ChatList } from "./ChatList";
import { SelectedChat } from "./SelectedChat";

export const Home = () => {
  const search = useMimessage((state) => state.search);
  return (
    <Box
      display={"flex"}
      flexDirection={"row"}
      width={"100%"}
      height={"100%"}
      sx={{ background: "none", borderRadius: 1, opacity: search ? 0 : 1 }}
    >
      <NoSsr>
        <ChatList />
      </NoSsr>
      <SelectedChat />
    </Box>
  );
};
