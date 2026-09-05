import React, { useState } from "react";
import { useMimessage, WRAPPED_ALL_TIME_YEAR } from "../../context";
import {
  useChatById,
  useChatMap,
  useHandleMap,
  useIsCurrentChatSingleMember,
  useSlowWrappedStats,
  useWrappedStats,
} from "../../hooks/dataHooks";
import type { WrappedStats } from "../../interfaces";
import { GenericValue, SectionHeader, SectionWrapper } from "./Containers";
import { MessagesByHour, MessagesByMonth, MessagesByPerson, MessagesByYear } from "./Charts";
import { SimpleWordcloud } from "./WordCloud";
import { SystemSymbol } from "../SystemSymbol";

const DisclosureIcon = ({ expanded }: { expanded: boolean }) => (
  <SystemSymbol name={expanded ? "chevron-up" : "chevron-down"} />
);

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
  const hasLeft = left.length > 0;
  const hasRight = right.length > 0;

  const showArrow = allRight.length > 5 || allLeft.length > 5;
  if (!hasLeft && !hasRight) {
    return null;
  }

  return (
    <SectionWrapper className="wrapped-comparison-card">
      {title && <SectionHeader>{title}</SectionHeader>}
      {isLoading && <progress className="wrapped-progress" aria-label={`Loading ${title}`} />}
      <div className="wrapped-comparison-columns">
        {hasLeft && (
          <div className="wrapped-comparison-column">
            <h3 className="wrapped-comparison-title">{leftTitle}</h3>
            {left.map((d) => render(d))}
          </div>
        )}
        {hasRight && (
          <div className="wrapped-comparison-column">
            <h3 className="wrapped-comparison-title">{rightTitle}</h3>
            {right.map((d) => render(d))}
          </div>
        )}
      </div>
      {showArrow && (
        <button
          type="button"
          className="wrapped-disclosure"
          aria-expanded={showAll}
          aria-label={showAll ? `Show fewer ${title}` : `Show all ${title}`}
          onClick={() => setShowAll((value) => !value)}
        >
          <span>{showAll ? "Show Less" : "Show More"}</span>
          <DisclosureIcon expanded={showAll} />
        </button>
      )}
    </SectionWrapper>
  );
};

const MessageCount = () => {
  const { data: wrappedStats } = useWrappedStats();
  const isCurrentChatSingleMember = useIsCurrentChatSingleMember();

  const chatMap = useChatMap();
  const uniqueContactIdentities = React.useMemo(() => {
    const interactions = wrappedStats?.chatInteractions;
    const sent = interactions?.sent || [];
    const received = interactions?.received || [];
    const identities = new Set<string>();
    for (const interaction of [...sent, ...received]) {
      if (interaction.chat_id === null) {
        continue;
      }
      for (const handle of chatMap.get(interaction.chat_id)?.handles || []) {
        const identity = handle.contact?.identifier
          ? `contact:${handle.contact.identifier}`
          : handle.handle_id !== null
            ? `handle:${handle.handle_id}`
            : handle.id
              ? `address:${handle.id}`
              : null;
        if (identity) {
          identities.add(identity);
        }
      }
    }
    return identities;
  }, [wrappedStats, chatMap]);
  return (
    <div className="wrapped-summary-grid" aria-label="Message totals">
      <SectionWrapper className="wrapped-stat-card">
        <SectionHeader>Sent</SectionHeader>
        <p className="wrapped-stat-value">{(wrappedStats?.messageCount?.sent || 0).toLocaleString()}</p>
      </SectionWrapper>
      <SectionWrapper className="wrapped-stat-card">
        <SectionHeader>Received</SectionHeader>
        <p className="wrapped-stat-value">{(wrappedStats?.messageCount?.received || 0).toLocaleString()}</p>
      </SectionWrapper>
      {!isCurrentChatSingleMember && (
        <SectionWrapper className="wrapped-stat-card">
          <SectionHeader>People</SectionHeader>
          <p className="wrapped-stat-value">{uniqueContactIdentities.size.toLocaleString()}</p>
        </SectionWrapper>
      )}
    </div>
  );
};
const FavoriteWords = () => {
  const { data: wrappedStats, isLoading } = useSlowWrappedStats();

  return (
    <TwoSidedSection
      title={"Favorite Words & Emoji"}
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
    <TwoSidedSection
      title={"Busiest Days"}
      data={interactions}
      render={(d) => <DayInteraction key={d.weekday} day={d} />}
    />
  );
};
const BusiestMonth = () => {
  const { data: wrappedStats } = useWrappedStats();
  const interactions = wrappedStats?.monthlyInteractions;
  return (
    <TwoSidedSection
      title={"Busiest Months"}
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
      title={"Top People"}
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
      title={"Late Night (12–4 AM)"}
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
    <h1 className="wrapped-dashboard-title" id="wrapped-title">
      {wrappedYear === WRAPPED_ALL_TIME_YEAR ? "" : `${wrappedYear} `}iMessage Wrapped
      {chat ? ` with ${chat.name}` : ""}
    </h1>
  );
};

export const SelectedWrap = () => {
  const wrappedStatsQuery = useWrappedStats();
  const { data: wrappedStats, error, isFetching, isPending, refetch } = wrappedStatsQuery;

  const wrappedYear = useMimessage((state) => state.wrappedYear);
  const chatId = useMimessage((state) => state.chatId);
  const isSingleMemberChat = useIsCurrentChatSingleMember();
  const isInitialLoading = isPending || (isFetching && !wrappedStats);
  const messageCount = (wrappedStats?.messageCount.sent || 0) + (wrappedStats?.messageCount.received || 0);

  return (
    <main className="wrapped-dashboard" aria-labelledby="wrapped-title">
      <header className="wrapped-dashboard-header draggable">
        <EntryHeader />
      </header>
      {isInitialLoading ? (
        <div className="wrapped-loading" aria-live="polite">
          <progress className="wrapped-progress" aria-label="Loading Wrapped statistics" />
          <p>Loading your message history…</p>
        </div>
      ) : !wrappedStats ? (
        <div className="wrapped-loading" role="alert">
          <p>{error ? "Mimessage couldn’t load your Wrapped statistics." : "Wrapped statistics are unavailable."}</p>
          <button className="wrapped-retry-button" type="button" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : messageCount === 0 ? (
        <div className="wrapped-loading" role="status">
          <p>No messages were found for this period.</p>
        </div>
      ) : (
        <div className="wrapped-dashboard-scroll">
          <MessageCount />
          <div className="wrapped-card-grid wrapped-insight-grid">
            <TopConversationPartners />
            <BusiestDay />
            <BusiestMonth />
            <MostPopularOpeners />
            <LateNightChatter />
            <FavoriteWords />
          </div>
          <div className="wrapped-card-grid wrapped-chart-grid">
            {wrappedYear === WRAPPED_ALL_TIME_YEAR && <MessagesByYear stats={wrappedStats.chartStats} />}
            <MessagesByMonth stats={wrappedStats.chartStats} />
            <MessagesByHour stats={wrappedStats.chartStats} />
            {chatId !== null && !isSingleMemberChat && <MessagesByPerson stats={wrappedStats.chartStats} />}
          </div>
          <div className="wrapped-card-grid wrapped-wordcloud-grid">
            <SimpleWordcloud />
          </div>
        </div>
      )}
    </main>
  );
};
