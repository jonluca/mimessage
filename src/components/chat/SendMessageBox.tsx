import React, { useRef } from "react";
import type { AiMessage } from "../../context";
import { useMimessage } from "../../context";
import { useAiMessagesForChatId, useChatById, useLocalMessagesForChatId } from "../../hooks/dataHooks";
import { OpenAiKey } from "./OpenAiKey";
import { SystemSymbol } from "../SystemSymbol";

const PlusIcon = () => <SystemSymbol name="plus" />;

const ArrowUpIcon = () => <SystemSymbol name="arrow-up" />;

const AudioWaveIcon = () => <SystemSymbol name="waveform" />;

const EmojiIcon = () => <SystemSymbol name="face-smiling" />;

const MessageAppsButton = () => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const openMenu = async () => {
    if (menuOpen) {
      return;
    }
    setMenuOpen(true);
    try {
      await global.ipcRenderer.invoke("showMessageAppsMenu");
    } finally {
      setMenuOpen(false);
    }
  };

  return (
    <button
      type="button"
      className="composer-add-button"
      aria-label="Apps"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      title="Apps"
      onClick={() => void openMenu()}
    >
      <PlusIcon />
    </button>
  );
};

export const SendMessageBox = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [hasDraft, setHasDraft] = React.useState(false);
  const inFlightRef = useRef(false);
  const updateConversation = useMimessage((state) => state.updateConversation);
  const chatId = useMimessage((state) => state.chatId);
  const openAiKey = useMimessage((state) => state.openAiKey);
  const chat = useChatById(chatId);
  const canCompose = Boolean(openAiKey && chat && chat.handles.length <= 1);
  const { data: localMessages, isLoading: isLoadingMessages } = useLocalMessagesForChatId(canCompose ? chatId : null);
  const currConvo = useAiMessagesForChatId(chatId);

  const submit = async () => {
    const current = inputRef.current;
    const content = current?.value.trim();
    if (!current || !content || chatId === null || !chat || !localMessages || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    const submittedChatId = chatId;
    const requestId = globalThis.crypto.randomUUID();
    const newMessage: AiMessage = { role: "user", content, date: new Date(), requestId };
    const pendingMessage: AiMessage = {
      role: "assistant",
      content: "",
      date: new Date(),
      pending: true,
      requestId,
    };
    current.value = "";
    current.style.height = "";
    setHasDraft(false);
    updateConversation(submittedChatId, (conversation) => [...conversation, newMessage, pendingMessage]);

    let responseMessage: AiMessage;
    try {
      const { default: openai } = await import("../../utils/openai");
      const prompts = openai.generatePrompts(newMessage, currConvo, localMessages, chat);
      const response = await openai.runCompletion(prompts);
      responseMessage = {
        ...(response || {
          role: "assistant",
          content: "I'm sorry, I don't know how to respond to that.",
          errored: true,
        }),
        date: new Date(),
        requestId,
      } as AiMessage;
    } catch (error) {
      console.error(error);
      responseMessage = {
        role: "assistant",
        content: "I'm sorry, I don't know how to respond to that.",
        date: new Date(),
        errored: true,
        requestId,
      };
    } finally {
      inFlightRef.current = false;
    }

    updateConversation(submittedChatId, (conversation) =>
      conversation.map((message) =>
        message.requestId === requestId && message.role === "assistant" ? responseMessage : message,
      ),
    );
  };

  const handleShortcuts = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      void submit();
    }
  };

  if (!chatId) {
    return null;
  }

  const isAwaitingResponse = currConvo.some((message) => message.pending);
  const tooManyParticipants = (chat?.handles.length || 0) > 1;
  const isDisabled = !chat || tooManyParticipants || isLoadingMessages || isAwaitingResponse;
  if (!openAiKey) {
    return (
      <footer className="message-composer message-composer--setup" aria-label="Message composer">
        <OpenAiKey />
      </footer>
    );
  }

  return (
    <footer className="message-composer message-composer--ai" aria-label="Message composer">
      <MessageAppsButton />
      <div className={`message-composer-field${isDisabled ? " is-disabled" : ""}`}>
        <textarea
          className="message-composer-input"
          ref={inputRef}
          aria-label="Ask AI about this conversation"
          rows={1}
          onKeyDown={handleShortcuts}
          onInput={(event) => {
            const input = event.currentTarget;
            setHasDraft(Boolean(input.value.trim()));
            input.style.height = "0";
            input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
          }}
          placeholder={tooManyParticipants ? "Not available in group conversations" : "iMessage"}
          disabled={isDisabled}
        />
        {!tooManyParticipants && hasDraft ? (
          <button
            type="button"
            className="message-composer-send"
            aria-label="Send AI message"
            disabled={isDisabled}
            onClick={() => void submit()}
          >
            <ArrowUpIcon />
          </button>
        ) : (
          <span className="message-composer-audio-icon" aria-hidden="true">
            <AudioWaveIcon />
          </span>
        )}
      </div>
      <button
        type="button"
        className="message-composer-emoji-icon"
        aria-label="Show emoji and symbols"
        title="Show emoji and symbols"
        onClick={() => {
          inputRef.current?.focus();
          void global.ipcRenderer.invoke("showEmojiPanel");
        }}
      >
        <EmojiIcon />
      </button>
    </footer>
  );
};
