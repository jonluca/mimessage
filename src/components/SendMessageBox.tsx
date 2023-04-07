import InputBase from "@mui/material/InputBase";
import { styled } from "@mui/material/styles";
import React, { useEffect, useRef } from "react";
import theme from "./theme";
import Box from "@mui/material/Box";
import type { AiMessage } from "../context";
import { useMimessage } from "../context";
import { useChatById, useLocalMessagesForChatId } from "../hooks/dataHooks";
import openai from "../utils/openai";

const SearchInput = styled(InputBase)<{ light?: boolean }>`
  display: flex;
  border-radius: 5px;
  color: ${(p) => (p.light ? undefined : theme.colors.white)};
  background: #3a3e44;
`;

export const SendMessageBox = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const setExtendedConversations = useMimessage((state) => state.setExtendedConversations);
  const extendedConversations = useMimessage((state) => state.extendedConversations);
  const chatId = useMimessage((state) => state.chatId);
  const chat = useChatById(chatId);
  const { data: localMessages, isLoading: isLoadingMessages } = useLocalMessagesForChatId(chatId);

  const currConvo = React.useMemo(() => extendedConversations[chatId!] ?? [], [chatId, extendedConversations]);

  useEffect(() => {
    const current = inputRef.current;
    const handleShortcuts = async (event: KeyboardEvent) => {
      if (current && chatId) {
        if (event.key === "Enter") {
          // submit message
          const newMessage = {
            role: "user",
            content: current.value,
            date: new Date(),
          } as AiMessage;
          current.value = "";
          extendedConversations[chatId] = [...currConvo, newMessage];
          setExtendedConversations(extendedConversations);

          const prompts = openai.generatePrompts(newMessage, currConvo, localMessages!, chat!);
          const response = await openai.runCompletion(prompts);
          newMessage.response = response;
          extendedConversations[chatId] = [...currConvo, newMessage];
          setExtendedConversations(extendedConversations);
        }
      }
    };
    current?.addEventListener("keydown", handleShortcuts);
    return () => {
      current?.removeEventListener("keydown", handleShortcuts);
    };
  }, [chat, chatId, currConvo, extendedConversations, localMessages, setExtendedConversations]);

  if (!chatId) {
    return null;
  }

  return (
    // absolutely center dev
    <Box sx={{ display: "flex", flexDirection: "row", pt: 1 }}>
      <SearchInput
        ref={ref}
        sx={{ borderRadius: 4, width: "100%", mx: 1.25, height: 30, background: "#3a3e44" }}
        inputProps={{
          sx: { borderRadius: 4, px: 1.5, color: theme.colors.white, background: "#3a3e44" },
          ref: inputRef,
        }}
        placeholder={"AI Message"}
        disabled={
          (chat?.handles.length || 0) > 1 ||
          isLoadingMessages ||
          (Boolean(currConvo.length) && currConvo[currConvo.length - 1].response === null)
        }
      />
    </Box>
  );
};
