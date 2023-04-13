import React, { useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage, WRAPPED_ALL_TIME_YEAR } from "../../context";
import {
  useChatById,
  useChatMap,
  useHandleMap,
  useIsCurrentChatSingleMember,
  useSlowWrappedStats,
  useWrappedStats,
} from "../../hooks/dataHooks";
import Typography from "@mui/material/Typography";
import type { WrappedStats } from "../../interfaces";
import type { BoxProps } from "@mui/material/Box/Box";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import { LinearProgress } from "@mui/material";
const GenericValue = ({ text, number }: { text: string; number: string | bigint | number }) => {
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"center"}>
      <Typography sx={{ color: "#5871f5", display: "flex", mr: 1, width: 70, fontWeight: "bold" }}>
        {(number || 0).toLocaleString()}
      </Typography>
      <Typography
        title={text}
        sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}
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
  data,
  render,
  leftKey = "sent",
  rightKey = "received",
  leftTitle = "Sent",
  rightTitle = "Received",
  isLoading,
}: {
  title: string;
  render: (val: any) => any;
  data: { [key: string]: any[] } | undefined;
  leftKey?: string;
  rightKey?: string;
  leftTitle?: string;
  rightTitle?: string;
  isLoading?: boolean;
}) => {
  const [showAll, setShowAll] = useState(false);
  const allLeft = data?.[leftKey] || [];
  const left = allLeft?.slice(0, showAll ? 10 : 5) || [];
  const allRight = data?.[rightKey] || [];
  const right = allRight?.slice(0, showAll ? 10 : 5) || [];
  const hasLeft = right.length > 0;
  const hasRight = left.length > 0;

  const showArrow = allRight.length > 5 || allLeft.length > 5;
  if (!hasLeft && !hasRight) {
    return null;
  }

  const ArrowIcon = showAll ? ArrowDropUpIcon : ArrowDropDownIcon;

  return (
    <SectionWrapper sx={{ width: SECTION_WIDTH, minHeight: SECTION_HEIGHT }}>
      {title && <SectionHeader>{title}</SectionHeader>}
      {isLoading && <LinearProgress />}
      <Box sx={{ width: "100%", display: "flex" }}>
        {hasRight && (
          <Box sx={{ width: "50%", display: "flex", flexDirection: "column", alignItems: "start", mr: 1 }}>
            <Typography>{leftTitle}</Typography>
            {left.map((d) => render(d))}
          </Box>
        )}
        {hasLeft && (
          <Box sx={{ width: "50%", display: "flex", flexDirection: "column", alignItems: "start" }}>
            <Typography>{rightTitle}</Typography>
            {right.map((d) => render(d))}
          </Box>
        )}
      </Box>
      {showArrow && (
        <ArrowIcon sx={{ width: "100%", cursor: "pointer", color: "white" }} onClick={() => setShowAll((v) => !v)} />
      )}
    </SectionWrapper>
  );
};
const MessageCount = () => {
  const { data: wrappedStats } = useWrappedStats();
  const isCurrentChatSingleMember = useIsCurrentChatSingleMember();

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
  const wrapperStyle = { width: 350 };
  const sx = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontWeight: "bold",
    fontSize: 40,
  };
  return (
    <>
      <Box display={"flex"}>
        <SectionWrapper sx={wrapperStyle}>
          <SectionHeader>Sent</SectionHeader>
          <Typography sx={sx}>{(wrappedStats?.messageCount?.sent || 0).toLocaleString()}</Typography>
        </SectionWrapper>
        <SectionWrapper sx={wrapperStyle}>
          <SectionHeader>Received</SectionHeader>
          <Typography sx={sx}>{(wrappedStats?.messageCount?.received || 0).toLocaleString()}</Typography>
        </SectionWrapper>
        {!isCurrentChatSingleMember && (
          <SectionWrapper sx={wrapperStyle}>
            <SectionHeader>People</SectionHeader>
            <Typography sx={sx}>{(uniqueContacts?.size || 0).toLocaleString()}</Typography>
          </SectionWrapper>
        )}
      </Box>
    </>
  );
};
const FavoriteWords = () => {
  const { data: wrappedStats, isLoading } = useSlowWrappedStats();

  return (
    <TwoSidedSection
      title={"Favorite Text"}
      leftKey={"topOneHundred"}
      rightKey={"topEmojis"}
      data={wrappedStats}
      leftTitle={"Words"}
      rightTitle={"Emojis"}
      render={(wordCount) => <GenericValue key={wordCount[0]} text={wordCount[0]} number={wordCount[1]} />}
      isLoading={isLoading}
    />
  );
};

const ChatInteraction = ({
  chatInteraction,
}: {
  chatInteraction: { chat_id: number | null; message_count: number | string | bigint };
}) => {
  const chatMap = useChatMap();
  const chat = chatMap?.get(chatInteraction.chat_id!);
  const isSingleMemberChat = useIsCurrentChatSingleMember();
  return <GenericValue text={isSingleMemberChat ? "" : chat?.name || ""} number={chatInteraction.message_count || 0} />;
};

const HandleInteraction = ({
  handle,
}: {
  handle: { handle_id: number | null; message_count: number | string | bigint };
}) => {
  const handleMap = useHandleMap();
  const h = handleMap?.[handle.handle_id!];
  return <GenericValue text={h?.contact?.parsedName || h?.id || "Unknown"} number={handle.message_count || 0} />;
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
    <TwoSidedSection title={"Days"} data={interactions} render={(d) => <DayInteraction key={d.weekday} day={d} />} />
  );
};
const BusiestMonth = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.monthlyInteractions;
  return (
    <TwoSidedSection
      title={"Months"}
      data={interactions}
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
      data={openers}
      render={(m) => <OpenerCount key={m.text} opener={m.text} count={m.count ?? 0} />}
    />
  );
};

const TopConversationPartners = () => {
  const { data: wrappedStats } = useWrappedStats();
  const isSingleMemberChat = useIsCurrentChatSingleMember();

  if (isSingleMemberChat) {
    // dont render this page for an individual
    return null;
  }
  const interactions = wrappedStats?.chatInteractions;
  const handleInteractions = wrappedStats?.handleInteractions;
  return (
    <TwoSidedSection
      title={"People"}
      data={handleInteractions || interactions}
      render={(i) => {
        if (handleInteractions) {
          return <HandleInteraction key={i.handle_id} handle={i} />;
        }
        return <ChatInteraction key={i.chat_id} chatInteraction={i} />;
      }}
    />
  );
};
const LateNightChatter = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.lateNightInteractions;
  return (
    <TwoSidedSection
      title={"Down Bad (12am-4am)"}
      data={interactions}
      render={(m) => <ChatInteraction key={m.chat_id} chatInteraction={m} />}
    />
  );
};

const EntryHeader = () => {
  const chatId = useMimessage((state) => state.chatId);
  const chat = useChatById(chatId);

  const wrappedYear = useMimessage((state) => state.wrappedYear);
  return (
    <Typography variant={"h1"}>
      Your {wrappedYear === WRAPPED_ALL_TIME_YEAR ? "" : `${wrappedYear} `}iMessage Wrapped
      {chat ? ` with ${chat.name}` : ""}
    </Typography>
  );
};

export const SelectedWrap = () => {
  const { isFetching } = useWrappedStats();

  const wrappedYear = useMimessage((state) => state.wrappedYear);

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
      {isFetching ? (
        <LinearProgress />
      ) : (
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
            <FavoriteWords />
            {wrappedYear === WRAPPED_ALL_TIME_YEAR && null}
          </Box>
        </Box>
      )}
    </Box>
  );
};
