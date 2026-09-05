import type { Chat } from "../../interfaces";
import { useMimessage } from "../../context";
import { MessageAvatar } from "../message/Avatar";
import React from "react";
import type { Contact } from "electron-mac-contacts";
import { CHAT_LIST_WIDTH } from "./ChatList";
import dayjs from "dayjs";

export const CHAT_HEIGHT = 82;

export const isChatUnread = (chat: Chat) => {
  const latestMessageDate = chat.latest_message_date;
  const lastReadMessageDate = chat.last_read_message_timestamp ?? 0;
  const latestMessageIsRead = chat.latest_message_is_read;
  return (
    chat.latest_message_is_from_me === 0 &&
    (latestMessageIsRead === 0 ||
      (latestMessageIsRead === null &&
        typeof latestMessageDate === "number" &&
        Number.isFinite(latestMessageDate) &&
        latestMessageDate > lastReadMessageDate))
  );
};

const APPLE_EPOCH_MILLISECONDS = 978_307_200_000;
const conversationTimeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const conversationWeekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const conversationDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "numeric",
  year: "2-digit",
});

const messageDate = (value: unknown) => {
  if (value instanceof Date) {
    return value;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }
  if (numericValue > 100_000_000_000_000) {
    return new Date(numericValue / 1_000_000 + APPLE_EPOCH_MILLISECONDS);
  }
  if (numericValue > 10_000_000_000) {
    return new Date(numericValue);
  }
  return new Date(numericValue * 1000);
};

const formatConversationDate = (value: unknown) => {
  const date = messageDate(value);
  if (!date) {
    return "";
  }
  const now = dayjs();
  const target = dayjs(date);
  if (target.isSame(now, "day")) {
    return conversationTimeFormatter.format(date);
  }
  if (target.isSame(now.subtract(1, "day"), "day")) {
    return "Yesterday";
  }
  if (now.diff(target, "day") < 7) {
    return conversationWeekdayFormatter.format(date);
  }
  return conversationDateFormatter.format(date);
};

interface ChatEntryProps {
  style?: React.CSSProperties;
  chat: Chat;
}

const ChatEntryRenderer = ({
  name,
  contact,
  date,
  text,
  isSelected,
  isUnread,
  onClick,
  style,
}: {
  name: string;
  isSelected: boolean;
  isUnread: boolean;
  onClick: () => void;
  text?: string | undefined | null;
  contact?: Contact | null | undefined;
  date?: unknown;
  style?: React.CSSProperties;
}) => {
  const isInWrapped = useMimessage((state) => state.isInWrapped);

  return (
    <button
      type="button"
      className={`conversation-row${isSelected ? " is-selected" : ""}${isUnread ? " is-unread" : ""}`}
      style={{ width: CHAT_LIST_WIDTH - 16, height: CHAT_HEIGHT, minHeight: CHAT_HEIGHT, ...style }}
      aria-current={isSelected ? "page" : undefined}
      onClick={onClick}
    >
      <span className="conversation-unread-indicator" aria-hidden="true" />
      <span className="conversation-avatar">
        <MessageAvatar contact={contact} fallback={name} size={52} />
      </span>
      <span className="conversation-copy">
        <span className="conversation-title-line">
          <span className="conversation-name">{name}</span>
          {date ? <span className="conversation-date">{formatConversationDate(date)}</span> : null}
          {isInWrapped && (
            <span className="conversation-wrapped-mark" aria-label="Included in Wrapped">
              ✦
            </span>
          )}
        </span>
        {text && <span className="conversation-preview">{text}</span>}
      </span>
    </button>
  );
};

export const ChatEntry = React.memo(function ChatEntry({ chat, style }: ChatEntryProps) {
  const isSelected = useMimessage(
    (state) =>
      state.chatId === chat.chat_id || Boolean(state.chatId && chat.sameParticipantChatIds?.includes(state.chatId)),
  );
  const setChatId = useMimessage((state) => state.setChatId);
  const setGlobalSearch = useMimessage((state) => state.setGlobalSearch);
  const setIsComposingNewMessage = useMimessage((state) => state.setIsComposingNewMessage);
  const setMessageIdToBringToFocus = useMimessage((state) => state.setMessageIdToBringToFocus);
  const setSelectedSearchMessageId = useMimessage((state) => state.setSelectedSearchMessageId);

  const handles = chat.handles || [];
  const name = chat.name;
  const isSingleConvo = handles.length === 1;

  return (
    <ChatEntryRenderer
      style={style}
      isSelected={isSelected}
      isUnread={isChatUnread(chat)}
      onClick={() => {
        if (isSelected) {
          return;
        }
        setIsComposingNewMessage(false);
        setMessageIdToBringToFocus(null);
        setSelectedSearchMessageId(null);
        setChatId(chat.chat_id!);
        setGlobalSearch(null);
      }}
      contact={isSingleConvo ? handles[0].contact : null}
      date={chat.latest_message_date}
      name={name}
      text={chat?.text}
    />
  );
});
