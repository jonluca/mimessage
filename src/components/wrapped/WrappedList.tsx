import React from "react";
import Box from "@mui/material/Box";
import { ImessageWrapped } from "../chat-list/ImessageWrapped";
import { CHAT_CONTAINER_STYLE, ChatListWrapper } from "../chat-list/ChatList";
import { ChatEntryRenderer } from "../chat-list/ChatEntry";
import { useMimessage } from "../../context";

const WRAPPED_ENTRIES = [
  {
    key: "COUNT_SENT",
    title: "Messages sent and received",
  },
  {
    key: "MOST_COMMUNICATED",
    title: "Top conversation partners",
  },
  {
    key: "BUSIEST_DAY",
    title: "Busiest day of the week",
  },
  {
    key: "BUSIEST_MONTH",
    title: "Busiest month",
  },
  {
    key: "MOST_USED_EMOJIS",
    title: "Most-used emojis",
  },
  {
    key: "MOST_COMMON_WORDS",
    title: "Most common words or phrases",
  },
  {
    key: "LONGEST_CONVERSATION_STREAK",
    title: "Longest conversation streak",
  },
  {
    key: "LATE_NIGHT_CHATTER",
    title: "Late-night chatter",
  },
  {
    key: "WORD_CLOUD",
    title: "Word cloud",
  },
  {
    key: "CONVERSATION_STARTERS",
    title: "Conversation starters",
  },
  {
    key: "GROUP_CHAT_ACTIVITY",
    title: "Group chat activity",
  },
  {
    key: "FASTEST_RESPONSE_TIME",
    title: "Fastest response time",
  },
] as const;
/**
 * Total messages sent and received: Showcase the number of messages you've exchanged with friends, family, and colleagues throughout the year.
 *
 * Top conversation partners: Rank the people you've communicated with the most frequently over the year, similar to your top artists on Spotify.
 *
 * Busiest day of the week: Identify the day you tend to send and receive the most messages.
 *
 * Busiest month: Highlight the month during which you had the most text message activity.
 *
 * Most-used emojis: Showcase your top emojis and their frequency of use.
 *
 * Most common words or phrases: Identify the words or phrases you use the most in your conversations.
 *
 * Longest conversation streak: Highlight the longest period of consecutive days you've had a conversation with a specific person.
 *
 * Late-night chatter: Show the percentage of messages sent during late-night hours (e.g., 10 pm to 4 am).
 *
 * Word cloud: Generate a word cloud that visually represents the most common words in your conversations throughout the year.
 *
 * Conversation starters: Rank the contacts who initiate conversations with you the most frequently.
 *
 * Group chat activity: Highlight the most active group chats and the number of messages exchanged in them.
 *
 * Fastest response time: Identify the contact(s) who typically respond to your messages the fastest.
 */
export type WrappedEntry = typeof WRAPPED_ENTRIES[number];
const WrappedEntry = ({ entry }: { entry: WrappedEntry }) => {
  const wrappedEntry = useMimessage((state) => state.wrappedEntry);
  const setWrappedEntry = useMimessage((state) => state.setWrappedEntry);
  const onClick = () => {
    setWrappedEntry(entry);
    // none
  };
  return (
    <ChatEntryRenderer text={" "} isSelected={wrappedEntry?.key === entry.key} onClick={onClick} name={entry.title} />
  );
};

export const WrappedList = () => {
  return (
    <ChatListWrapper>
      <Box sx={{ minHeight: 50 }}>YEAR SELECTOR</Box>
      <ImessageWrapped back />
      <Box
        display={"flex"}
        sx={{
          display: "flex",
          overflowY: "auto",
          height: "100%",
        }}
      >
        <Box
          sx={{
            ...CHAT_CONTAINER_STYLE,
            height: `100%`,
          }}
        >
          {WRAPPED_ENTRIES?.map((entry) => {
            return <WrappedEntry key={entry.key} entry={entry} />;
          })}
        </Box>
      </Box>
    </ChatListWrapper>
  );
};
