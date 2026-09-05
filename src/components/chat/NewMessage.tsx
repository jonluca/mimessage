import React, { useMemo, useRef, useState } from "react";
import { useMimessage } from "../../context";
import { useChatList } from "../../hooks/dataHooks";
import type { Chat } from "../../interfaces";
import { MessageAvatar } from "../message/Avatar";
import { SystemSymbol } from "../SystemSymbol";

const AddContactIcon = () => <SystemSymbol name="plus-circle-fill" />;

const PlusIcon = () => <SystemSymbol name="plus" />;

const AudioIcon = () => <SystemSymbol name="waveform" />;

const EmojiIcon = () => <SystemSymbol name="face-smiling" />;

const chatSearchText = (chat: Chat) =>
  [
    chat.name,
    chat.chat_identifier,
    ...chat.handles.flatMap((handle) => [
      handle.id,
      handle.contact?.parsedName,
      ...(handle.contact?.emailAddresses || []),
      ...(handle.contact?.phoneNumbers || []),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

export const NewMessage = () => {
  const { data: chats } = useChatList();
  const [recipient, setRecipient] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const setChatId = useMimessage((state) => state.setChatId);
  const setIsComposingNewMessage = useMimessage((state) => state.setIsComposingNewMessage);
  const normalizedRecipient = recipient.trim().toLocaleLowerCase();
  const suggestions = useMemo(() => {
    if (!normalizedRecipient) {
      return [];
    }
    const seen = new Set<number>();
    return (chats || [])
      .filter((chat) => {
        if (chat.chat_id === null || seen.has(chat.chat_id) || !chatSearchText(chat).includes(normalizedRecipient)) {
          return false;
        }
        seen.add(chat.chat_id);
        return true;
      })
      .slice(0, 8);
  }, [chats, normalizedRecipient]);

  const openConversation = (chat: Chat) => {
    if (chat.chat_id === null) {
      return;
    }
    setIsComposingNewMessage(false);
    setChatId(chat.chat_id);
  };

  return (
    <main className="conversation-pane new-message-pane" aria-label="New Message">
      <header className="new-message-recipient-header draggable">
        <label htmlFor="new-message-recipient">To:</label>
        <input
          ref={inputRef}
          autoFocus
          id="new-message-recipient"
          value={recipient}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setRecipient(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length) {
              event.preventDefault();
              document.querySelector<HTMLElement>(".new-message-suggestion")?.focus();
            }
            if (event.key === "Enter" && suggestions[0]) {
              event.preventDefault();
              openConversation(suggestions[0]);
            }
          }}
        />
        <button
          type="button"
          className="new-message-add-contact"
          aria-label="Choose an existing conversation"
          title="Choose an existing conversation"
          onClick={() => inputRef.current?.focus()}
        >
          <AddContactIcon />
        </button>
      </header>

      {normalizedRecipient && suggestions.length ? (
        <ul className="new-message-suggestions" aria-label="Recipient suggestions">
          {suggestions.map((chat) => {
            const singleContact = chat.handles.length === 1 ? chat.handles[0]?.contact : null;
            return (
              <li key={chat.chat_id}>
                <button type="button" className="new-message-suggestion" onClick={() => openConversation(chat)}>
                  <MessageAvatar contact={singleContact} fallback={chat.name || "?"} size={30} />
                  <span>
                    <strong>{chat.name || "Unknown"}</strong>
                    <small>{chat.chat_identifier || chat.handles[0]?.id || "Existing conversation"}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="new-message-blank" aria-hidden="true" />
      <footer className="message-composer new-message-composer" aria-label="Message composer">
        <button
          type="button"
          className="composer-add-button"
          aria-label="Apps"
          aria-haspopup="menu"
          onClick={() => void global.ipcRenderer.invoke("showMessageAppsMenu")}
        >
          <PlusIcon />
        </button>
        <div className="message-composer-field is-disabled">
          <textarea className="message-composer-input" disabled aria-label="Message" rows={1} placeholder="iMessage" />
          <span className="new-message-audio-icon" aria-hidden="true">
            <AudioIcon />
          </span>
        </div>
        <button
          type="button"
          className="message-composer-emoji-icon"
          aria-label="Show emoji and symbols"
          onClick={() => void global.ipcRenderer.invoke("showEmojiPanel")}
        >
          <EmojiIcon />
        </button>
      </footer>
    </main>
  );
};
