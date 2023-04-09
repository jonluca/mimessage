import React from "react";
import Box from "@mui/material/Box";
import { useMimessage, WRAPPED_ALL_TIME_YEAR } from "../../context";
import { useChatMap, useWrappedStats } from "../../hooks/dataHooks";
import Typography from "@mui/material/Typography";
import type { WrappedStats } from "../../interfaces";

const GenericValue = ({ text, number }: { text: string; number: string | bigint | number }) => {
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"center"}>
      <Typography sx={{ mr: 1 }}>{text}</Typography>
      <ChunkyNumber number={number || 0} />
    </Box>
  );
};

const ChunkyNumber = ({ number }: { number: string | bigint | number }) => {
  return <Typography variant={"h1"}>{number.toLocaleString()}</Typography>;
};

const MessageCount = () => {
  const { data: wrappedStats } = useWrappedStats();

  const chatMap = useChatMap();
  const contacts = React.useMemo(() => {
    const interactions = wrappedStats?.chatInteractions;
    const sent = interactions?.sent || [];
    const received = interactions?.received || [];
    return [
      ...sent.map((i) => chatMap?.get(i.chat_id!)?.handles),
      ...received.map((i) => chatMap?.get(i.chat_id!)?.handles),
    ].flat();
  }, [wrappedStats, chatMap]);

  const uniqueContacts = new Set(contacts.flat());
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"flex-start"} flexDirection={"column"}>
      <EntryHeader />
      <GenericValue text={"You sent"} number={wrappedStats?.messageCountSent || 0} />
      <GenericValue text={"and received"} number={wrappedStats?.messageCountReceived || 0} />
      <GenericValue text={"messages with"} number={uniqueContacts?.size || 0} />
      <Typography>people</Typography>
    </Box>
  );
};

const ChatInteraction = ({
  chatInteraction,
}: {
  chatInteraction: { chat_id: number | null; message_count: number | string | bigint };
}) => {
  const chatMap = useChatMap();
  const chat = chatMap?.get(chatInteraction.chat_id!);
  return <GenericValue text={chat?.name || ""} number={chatInteraction.message_count || 0} />;
};

const DayInteraction = ({ day }: { day: WrappedStats["weekdayInteractions"]["sent"][number] }) => {
  return <GenericValue text={day.weekday} number={day.message_count || 0} />;
};

const MonthInteraction = ({ month }: { month: WrappedStats["monthlyInteractions"]["sent"][number] }) => {
  return <GenericValue text={month.month} number={month.message_count || 0} />;
};
const BusiestDay = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.weekdayInteractions;
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"flex-start"} flexDirection={"column"}>
      <EntryHeader />
      <Typography>You sent the most messages on</Typography>
      {interactions?.sent.map((d) => (
        <DayInteraction key={d.weekday} day={d} />
      ))}
      <Typography>While you were sent the most messages on</Typography>
      {interactions?.received.map((d) => (
        <DayInteraction key={d.weekday} day={d} />
      ))}
    </Box>
  );
};
const BusiestMonth = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.monthlyInteractions;
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"flex-start"} flexDirection={"column"}>
      <EntryHeader />
      <Typography>You sent the most messages on</Typography>
      {interactions?.sent.slice(0, 5).map((d) => (
        <MonthInteraction key={d.month} month={d} />
      ))}
      <Typography>While you were sent the most messages on</Typography>
      {interactions?.received.slice(0, 5).map((d) => (
        <MonthInteraction key={d.month} month={d} />
      ))}
    </Box>
  );
};

const TopConversationPartners = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.chatInteractions;
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"flex-start"} flexDirection={"column"}>
      <EntryHeader />
      <Typography sx={{ my: 1, fontWeight: "bold" }}>You sent the most messages to these chats</Typography>
      {interactions?.sent.slice(0, 5).map((i) => (
        <ChatInteraction key={i.chat_id} chatInteraction={i} />
      ))}
      <Typography sx={{ my: 1, fontWeight: "bold" }}>
        While the chats where you received the most messages were
      </Typography>
      {interactions?.received.slice(0, 5).map((i) => (
        <ChatInteraction key={i.chat_id} chatInteraction={i} />
      ))}
    </Box>
  );
};
const LateNightChatter = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.lateNightInteractions;
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"flex-start"} flexDirection={"column"}>
      <EntryHeader />
      <Typography>Between the hours of 11pm and 4am, you spent the most time messaging these people</Typography>
      {interactions?.sent.slice(0, 5).map((i) => (
        <ChatInteraction key={i.chat_id} chatInteraction={i} />
      ))}
      <Typography>While these people spent the most time messaging you</Typography>
      {interactions?.received.slice(0, 5).map((i) => (
        <ChatInteraction key={i.chat_id} chatInteraction={i} />
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
        return <BusiestDay />;
      case "BUSIEST_MONTH":
        return <BusiestMonth />;
      case "MOST_USED_EMOJIS":
        return <TopConversationPartners />;
      case "MOST_COMMON_WORDS":
        return <TopConversationPartners />;
      case "LONGEST_CONVERSATION_STREAK":
        return <TopConversationPartners />;
      case "LATE_NIGHT_CHATTER":
        return <LateNightChatter />;
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
