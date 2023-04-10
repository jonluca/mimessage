import InputBase from "@mui/material/InputBase";
import { styled } from "@mui/material/styles";
import Cross from "@mui/icons-material/Close";
import React, { useRef } from "react";
import theme from "../theme";
import Box from "@mui/material/Box";
import type { AiMessage } from "../../context";
import { useMimessage } from "../../context";
import { useChatById, useLocalMessagesForChatId } from "../../hooks/dataHooks";
import openai from "../../utils/openai";
import { SetOpenAiKey } from "./SetOpenAiKey";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import { Button } from "@mui/material";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import { Check } from "@mui/icons-material";

const SearchInput = styled(InputBase)<{ light?: boolean }>`
  display: flex;
  border-radius: 5px;
  color: ${(p) => (p.light ? undefined : theme.colors.white)};
  background: #3a3e44;
`;

const RELATION_OPTIONS = [
  "Friend",
  "Girlfriend",
  "Boyfriend",
  "Husband",
  "Wife",
  "Mother",
  "Father",
  "Brother",
  "Sister",
  "Grandmother",
  "Grandfather",
];

const SetRelationButton = () => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);
  const relation = useMimessage((state) => state.relation);
  const setRelation = useMimessage((state) => state.setRelation);

  const handleChangeRelation = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "relation-button" : undefined;

  return (
    <>
      <Button aria-describedby={id} variant="contained" title={"Change AI Relation"} onClick={handleChangeRelation}>
        <ManageAccountsIcon sx={{ mx: 0.5, color: theme.colors.white, fontSize: 18, cursor: "pointer" }} />
      </Button>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        PaperProps={{
          sx: { p: 2, backgroundColor: "#2c2c2c" },
        }}
      >
        <Box display={"flex"} flexDirection={"column"}>
          <Typography variant={"h4"}>Set Persons Relation To You</Typography>
          {RELATION_OPTIONS.map((option) => (
            <Button
              key={option}
              variant={"contained"}
              sx={{ my: 0.5 }}
              onClick={() => {
                setRelation(option);
              }}
            >
              {relation === option && <Check />}
              {option}
            </Button>
          ))}
        </Box>
      </Popover>
    </>
  );
};

export const SendMessageBox = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const setExtendedConversations = useMimessage((state) => state.setExtendedConversations);
  const extendedConversations = useMimessage((state) => state.extendedConversations);
  const chatId = useMimessage((state) => state.chatId);
  const openAiKey = useMimessage((state) => state.openAiKey);
  const setOpenAiKey = useMimessage((state) => state.setOpenAiKey);
  const chat = useChatById(chatId);
  const { data: localMessages, isLoading: isLoadingMessages } = useLocalMessagesForChatId(chatId);

  const currConvo = React.useMemo(() => extendedConversations[chatId!] ?? [], [chatId, extendedConversations]);
  const submit = async () => {
    const current = inputRef.current;
    const content = current?.value;
    if (current && content && chatId) {
      // submit message
      const newMessage = {
        role: "user",
        content,
        date: new Date(),
      } as AiMessage;
      current.value = "";
      extendedConversations[chatId] = [...currConvo, newMessage];
      setExtendedConversations(extendedConversations);

      const prompts = openai.generatePrompts(newMessage, currConvo, localMessages!, chat!);
      const response = await openai.runCompletion(prompts);
      newMessage.response = response;
      if (!response) {
        newMessage.response = { errored: true };
      }
      extendedConversations[chatId] = [...currConvo, newMessage];
      setExtendedConversations(extendedConversations);
    }
  };
  const handleShortcuts = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      submit();
    }
  };
  if (!chatId) {
    return null;
  }

  const isAwaitingResponse = Boolean(currConvo.length) && currConvo[currConvo.length - 1].response === null;
  const tooManyParticipants = (chat?.handles.length || 0) > 1;
  const isDisabled = tooManyParticipants || isLoadingMessages || isAwaitingResponse;
  return (
    <Box sx={{ display: "flex", flexDirection: "row", py: 1, justifyContent: "center", alignItems: "center" }}>
      {openAiKey ? (
        <>
          <SearchInput
            ref={ref}
            sx={{
              borderRadius: 4,
              width: "100%",
              mx: 1.25,
              height: 30,
              background: "#3a3e44",
              "& .MuiInputBase-input.Mui-disabled": {
                WebkitTextFillColor: "white",
              },
            }}
            inputProps={{
              sx: { borderRadius: 4, px: 1.5, color: theme.colors.white, background: "#3a3e44" },
              ref: inputRef,
              onKeyDown: handleShortcuts,
            }}
            placeholder={tooManyParticipants ? "AI message cannot be used in group chats" : "AI message"}
            disabled={isDisabled}
          />
          {!tooManyParticipants && (
            <>
              <ArrowUpwardIcon
                sx={{ mx: 0.5, color: theme.colors.white, fontSize: 18, cursor: "pointer" }}
                titleAccess={"send"}
                onClick={submit}
              />
              <SetRelationButton />
              <Cross
                sx={{ mx: 0.5, color: theme.colors.white, fontSize: 18, cursor: "pointer" }}
                titleAccess={"Clear API Key"}
                onClick={() => {
                  setOpenAiKey(null);
                }}
              />
            </>
          )}
        </>
      ) : (
        <SetOpenAiKey />
      )}
    </Box>
  );
};
