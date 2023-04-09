import React from "react";
import Box from "@mui/material/Box";
import { useMimessage, WRAPPED_ALL_TIME_YEAR } from "../../context";
import { useWrappedStats } from "../../hooks/dataHooks";
import Typography from "@mui/material/Typography";

const ChunkyNumber = ({ number }: { number: string | bigint | number }) => {
  return <Typography variant={"h1"}>{number.toLocaleString()}</Typography>;
};
const MessageCount = () => {
  const { data: wrappedStats } = useWrappedStats();
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"flex-start"} flexDirection={"column"}>
      <EntryHeader />
      <Typography>You sent</Typography>
      <ChunkyNumber number={wrappedStats?.messageCountSent || 0} />
      <Typography>and received</Typography>
      <ChunkyNumber number={wrappedStats?.messageCountReceived || 0} />
      <Typography>messages with</Typography>
      <ChunkyNumber number={wrappedStats?.contactInteractions.length || 0} />
      <Typography>people</Typography>
    </Box>
  );
};

const TopConversationPartners = () => {
  const { data: wrappedStats } = useWrappedStats();
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"flex-start"} flexDirection={"column"}>
      <EntryHeader />
      <Typography>Your most-messaged contacts weere</Typography>
      {wrappedStats?.contactInteractions.slice(0, 5).map((contactInteraction) => (
        <Box key={contactInteraction.contact?.identifier || contactInteraction.handle_identifier}>
          <Typography>{contactInteraction.contact?.parsedName || contactInteraction.handle_identifier}: </Typography>
          <ChunkyNumber number={contactInteraction.message_count || 0} />
        </Box>
      ))}
    </Box>
  );
};

const EntryHeader = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  return <Typography variant={"h1"}>{wrappedYear === WRAPPED_ALL_TIME_YEAR ? "All Time" : wrappedYear}</Typography>;
};
export const SelectedWrap = () => {
  const wrappedEntry = useMimessage((state) => state.wrappedEntry);

  const renderEntry = () => {
    if (!wrappedEntry) {
      return null;
    }

    switch (wrappedEntry.key) {
      case "MESSAGE_COUNTS":
        return <MessageCount />;
      case "MOST_COMMUNICATED":
        return <TopConversationPartners />;
      case "BUSIEST_DAY":
        return <TopConversationPartners />;
      case "BUSIEST_MONTH":
        return <TopConversationPartners />;
      case "MOST_USED_EMOJIS":
        return <TopConversationPartners />;
      case "MOST_COMMON_WORDS":
        return <TopConversationPartners />;
      case "LONGEST_CONVERSATION_STREAK":
        return <TopConversationPartners />;
      case "LATE_NIGHT_CHATTER":
        return <TopConversationPartners />;
      case "WORD_CLOUD":
        return <TopConversationPartners />;
      case "CONVERSATION_STARTERS":
        return <TopConversationPartners />;
      case "GROUP_CHAT_ACTIVITY":
        return <TopConversationPartners />;
      case "FASTEST_RESPONSE_TIME":
        return <TopConversationPartners />;
    }
    return null;
  };

  return (
    <Box
      sx={{
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        width: "100%",
        flexDirection: "column",
        background: "#1e1e1e",
      }}
    >
      <Box
        sx={{
          height: "100%",
          width: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          contain: "strict",
          p: 1,
          justifyContent: "center",
        }}
        display={"flex"}
      >
        {renderEntry()}
      </Box>
    </Box>
  );
};
