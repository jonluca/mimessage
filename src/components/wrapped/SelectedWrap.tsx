import React, { useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage, WRAPPED_ALL_TIME_YEAR } from "../../context";
import { useChatMap, useWrappedStats } from "../../hooks/dataHooks";
import Typography from "@mui/material/Typography";
import type { WrappedStats } from "../../interfaces";
import type { BoxProps } from "@mui/material/Box/Box";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
const GenericValue = ({ text, number }: { text: string; number: string | bigint | number }) => {
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"center"}>
      <Typography sx={{ color: "#5871f5", display: "flex", mr: 1, width: 70, fontWeight: "bold" }}>
        {(number || 0).toLocaleString()}
      </Typography>
      <Typography
        title={text}
        sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}
      >
        {text}
      </Typography>
    </Box>
  );
};

const SectionWrapper = (props: BoxProps) => {
  return (
    <Box
      {...props}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        background: "#2c2c2c",
        py: 1,
        px: 2,
        m: 1,
        borderRadius: 2,
        height: "fit-content",
        width: "fit-content",
        ...props.sx,
      }}
    />
  );
};

const SectionHeader = ({ children }: React.PropsWithChildren) => {
  return <Typography variant={"h2"}>{children}</Typography>;
};
const SECTION_WIDTH = 550;
const SECTION_HEIGHT = 200;
const TwoSidedSection = ({
  title,
  interactions,
  render,
}: {
  title: string;
  render: (val: any) => any;
  interactions: { sent: any[]; received: any[] } | undefined;
}) => {
  const [showAll, setShowAll] = useState(false);
  const sent = interactions?.sent.slice(0, showAll ? 10 : 5) || [];
  const received = interactions?.received.slice(0, showAll ? 10 : 5) || [];
  const hasReceived = received.length > 0;
  const hasSent = sent.length > 0;
  if (!hasReceived && !hasSent) {
    return null;
  }

  const ArrowIcon = showAll ? ArrowDropUpIcon : ArrowDropDownIcon;

  return (
    <SectionWrapper sx={{ width: SECTION_WIDTH, minHeight: SECTION_HEIGHT }}>
      {title && <SectionHeader>{title}</SectionHeader>}
      <Box sx={{ width: "100%", display: "flex" }}>
        {hasSent && (
          <Box sx={{ width: "50%", display: "flex", flexDirection: "column", alignItems: "start", mr: 1 }}>
            <Typography>Sent</Typography>
            {sent.map((d) => render(d))}
          </Box>
        )}
        {hasReceived && (
          <Box sx={{ width: "50%", display: "flex", flexDirection: "column", alignItems: "start" }}>
            <Typography>Received</Typography>
            {received.map((d) => render(d))}
          </Box>
        )}
      </Box>
      {(hasSent || hasReceived) && (
        <ArrowIcon sx={{ width: "100%", cursor: "pointer", color: "#3f78ff" }} onClick={() => setShowAll((v) => !v)} />
      )}
    </SectionWrapper>
  );
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
    <SectionWrapper>
      <SectionHeader>Messages</SectionHeader>
      <GenericValue text={"Sent"} number={wrappedStats?.messageCountSent || 0} />
      <GenericValue text={"Received"} number={wrappedStats?.messageCountReceived || 0} />
      <GenericValue text={"People"} number={uniqueContacts?.size || 0} />
    </SectionWrapper>
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

const OpenerCount = ({ opener, count }: { opener: string; count: number }) => {
  return <GenericValue text={opener} number={count || 0} />;
};
const BusiestDay = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.weekdayInteractions;
  return (
    <TwoSidedSection
      title={"Days"}
      interactions={interactions}
      render={(d) => <DayInteraction key={d.weekday} day={d} />}
    />
  );
};
const BusiestMonth = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.monthlyInteractions;
  return (
    <TwoSidedSection
      title={"Months"}
      interactions={interactions}
      render={(m) => <MonthInteraction key={m.month} month={m} />}
    />
  );
};
const MostPopularOpeners = () => {
  const { data: wrappedStats } = useWrappedStats();
  const openers = wrappedStats?.mostPopularOpeners;
  return (
    <TwoSidedSection
      title={"First Messages"}
      interactions={openers}
      render={(m) => <OpenerCount key={m.text} opener={m.text} count={m.count ?? 0} />}
    />
  );
};

const TopConversationPartners = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.chatInteractions;
  return (
    <TwoSidedSection
      title={"People"}
      interactions={interactions}
      render={(m) => <ChatInteraction key={m.chat_id} chatInteraction={m} />}
    />
  );
};
const LateNightChatter = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.lateNightInteractions;
  return (
    <TwoSidedSection
      title={"Down Bad"}
      interactions={interactions}
      render={(m) => <ChatInteraction key={m.chat_id} chatInteraction={m} />}
    />
  );
};

const EntryHeader = () => {
  const wrappedYear = useMimessage((state) => state.wrappedYear);
  return (
    <Typography variant={"h1"}>
      Your iMessage Wrapped{wrappedYear === WRAPPED_ALL_TIME_YEAR ? "" : `in ${wrappedYear}`}
    </Typography>
  );
};

export const SelectedWrap = () => {
  return (
    <Box
      sx={{
        zIndex: 999,
        justifyContent: "center",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        background: "#1e1e1e",
        alignItems: "center",
        overflowY: "hidden",
        p: 1,
      }}
    >
      <EntryHeader />
      <Box
        sx={{
          zIndex: 999,
          width: "100%",
          height: "100%",
          flexDirection: "column",
          background: "#1e1e1e",
          overflowY: "auto",
          display: "inline-flex",
        }}
      >
        <MessageCount />
        <Box sx={{ display: "flex", flexWrap: "wrap" }}>
          <TopConversationPartners />
          <BusiestDay />
          <BusiestMonth />
          <MostPopularOpeners />
          <LateNightChatter />
        </Box>
      </Box>
    </Box>
  );
};
