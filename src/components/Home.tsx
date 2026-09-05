import React from "react";
import dynamic from "next/dynamic";
import { useMimessage } from "../context";
import { ChatList } from "./chat-list/ChatList";
import { HighlightedMessage } from "./message/HighlightedMessage";
import { ComposeButton } from "./chat/ComposeButton";
import { NewMessage } from "./chat/NewMessage";

const SelectedChat = dynamic(() => import("./chat/SelectedChat").then((module) => module.SelectedChat), {
  ssr: false,
});
const SelectedWrap = dynamic(() => import("./wrapped/SelectedWrap").then((module) => module.SelectedWrap), {
  ssr: false,
});

const NoConversationSelected = () => (
  <main className="conversation-pane no-conversation-selected" aria-label="No conversation selected">
    <header className="thread-header draggable">
      <div className="thread-header-main no-conversation-toolbar">
        <div className="thread-header-left">
          <ComposeButton />
        </div>
        <span />
        <span />
      </div>
    </header>
    <div className="no-conversation-selected-content">
      <span>No Conversation Selected</span>
    </div>
  </main>
);

export const Home = () => {
  const chatId = useMimessage((state) => state.chatId);
  const isComposingNewMessage = useMimessage((state) => state.isComposingNewMessage);
  const isInWrapped = useMimessage((state) => state.isInWrapped);
  return (
    <div className="messages-app-shell">
      <ChatList />
      {isInWrapped ? (
        <SelectedWrap />
      ) : (
        <>
          {isComposingNewMessage ? (
            <NewMessage />
          ) : chatId === null ? (
            <NoConversationSelected />
          ) : (
            <SelectedChat key={chatId} />
          )}
          <HighlightedMessage />
        </>
      )}
    </div>
  );
};
