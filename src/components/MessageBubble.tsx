import React from "react";
import Box from "@mui/material/Box";
import type { Message } from "../interfaces";

export const MessageBubble = ({ message }: { message: null | undefined | Message }) => {
  if (!message) {
    return null;
  }

  const isFromMe = message.is_from_me;

  const isIMessage = message.service === "iMessage";
  return (
    <Box className={"message"}>
      <Box className={[isFromMe ? "sent" : "received", isIMessage ? "imessage" : "sms"].join(" ")}>
        <Box className={"message_part"}>
          <Box className={"bubble"}>{message.text}</Box>
        </Box>
      </Box>
    </Box>
  );
};
