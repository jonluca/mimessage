import React from "react";
import type { Handle, Message } from "../../interfaces";
import { MessageAvatar } from "./Avatar";
import {
  AttachmentView,
  getExternalHttpUrl,
  isPluginPayloadAttachment,
  RichLinkAttachmentView,
} from "./AttachmentView";
import type { AiMessage } from "../../context";
import dayjs from "dayjs";
import Highlighter from "react-highlight-words";
import { useMimessage } from "../../context";
import { useShallow } from "zustand/react/shallow";
import { SystemSymbol } from "../SystemSymbol";
import type { SystemSymbolName } from "../SystemSymbol";

type HandleMap = Record<number | string, Handle>;

const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});
const messageTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  hour: "numeric",
  hour12: false,
  minute: "2-digit",
  month: "numeric",
  year: "2-digit",
});
const messageWeekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const messageDateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", weekday: "short" });
const messageReceiptTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  hour12: false,
  minute: "2-digit",
});

const TAPBACK_PRESENTATION: Readonly<Record<number, { label: string; symbol?: SystemSymbolName; text?: string }>> = {
  2000: { label: "loved", symbol: "heart-fill" },
  2001: { label: "liked", symbol: "hand-thumbsup-fill" },
  2002: { label: "disliked", symbol: "hand-thumbsdown-fill" },
  2003: { label: "laughed at", text: "HA" },
  2004: { label: "emphasized", text: "!!" },
  2005: { label: "questioned", text: "?" },
};

const MessageTapbacks = ({ handleMap, message }: { handleMap: HandleMap; message: Message }) => {
  if (!message.tapbacks?.length) {
    return null;
  }

  const tapbacksByType = new Map<number, typeof message.tapbacks>();
  for (const tapback of message.tapbacks) {
    const matchingTapbacks = tapbacksByType.get(tapback.type);
    if (matchingTapbacks) {
      matchingTapbacks.push(tapback);
    } else {
      tapbacksByType.set(tapback.type, [tapback]);
    }
  }

  return (
    <span className="message-tapbacks">
      {[...tapbacksByType.entries()].map(([type, tapbacks]) => {
        const presentation = TAPBACK_PRESENTATION[type];
        if (!presentation) {
          return null;
        }
        const actorNames = tapbacks.map((tapback) => {
          if (tapback.is_from_me) {
            return "You";
          }
          return handleMap[tapback.handle_id ?? ""]?.contact?.parsedName || "Someone";
        });
        const label = `${actorNames.join(", ")} ${presentation.label} this message`;
        return (
          <span className="message-tapback" key={type} aria-label={label} role="img" title={label}>
            {presentation.symbol ? (
              <SystemSymbol className="message-tapback-symbol" name={presentation.symbol} />
            ) : (
              <span className={`message-tapback-text message-tapback-text--${type}`}>{presentation.text}</span>
            )}
            {tapbacks.length > 1 ? <span className="message-tapback-count">{tapbacks.length}</span> : null}
          </span>
        );
      })}
    </span>
  );
};

const getAnnouncementPresentation = (handleMap: HandleMap, message: Message) => {
  const itemType = message?.item_type;
  const groupActionType = message?.group_action_type;
  const groupTitle = message?.group_title;
  const otherHandle = message?.other_handle;
  const handle = handleMap?.[message.handle_id!];
  const contact = handle?.contact;
  const name = message.is_from_me || !message.handle_id ? "You" : contact?.parsedName || handle?.id || "Someone";
  let text = "";
  let symbol: SystemSymbolName = "person-2-fill";
  if (itemType == 1 && groupActionType == 1) {
    const otherContact = handleMap?.[otherHandle!]?.contact;
    const otherName = otherContact?.parsedName || handleMap?.[otherHandle!]?.id || "someone";
    text = `${name} removed ${otherName} from the conversation.`;
  } else if (itemType == 1 && groupActionType == 0) {
    const otherContact = handleMap?.[otherHandle!]?.contact;
    const otherName = otherContact?.parsedName || handleMap?.[otherHandle!]?.id || "someone";
    text = `${name} added ${otherName} to the conversation.`;
  } else if (itemType == 3 && (groupActionType ?? 0) > 0) {
    text = `${name} changed the group photo.`;
  } else if (itemType == 3) {
    text = `${name} left the conversation.`;
  } else if (itemType == 2 && groupTitle != null) {
    text = `${name} named the conversation “${groupTitle}”.`;
  } else if (itemType == 6) {
    symbol = "video-fill";
    text = `${name} started a FaceTime call.`;
  } else if ((itemType == 4 || itemType == 5) && groupActionType == 0) {
    symbol = "location-fill";
    const action = itemType == 4 ? "started sharing" : "stopped sharing";
    const isOutgoing = message.share_direction === 0 || (message.share_direction == null && name === "You");
    const otherHandle = message.other_handle ? handleMap[message.other_handle] : null;
    const recipientName = otherHandle?.contact?.parsedName || otherHandle?.id || "";
    text = isOutgoing
      ? `You ${action} location with ${recipientName}.`
      : `${contact?.parsedName || handle?.id || "Someone"} ${action} location with you.`;
  }
  if (!text) {
    return null;
  }
  return { symbol, text };
};

const AnnouncementBubble = ({ handleMap, message }: { handleMap: HandleMap; message: Message }) => {
  const presentation = getAnnouncementPresentation(handleMap, message);
  if (!presentation) {
    return null;
  }
  return (
    <div className="announcement">
      <SystemSymbol className="announcement-symbol" name={presentation.symbol} />
      <span>{presentation.text}</span>
    </div>
  );
};

const ReplyOriginPreview = ({
  handleMap,
  message,
  onOpen,
}: {
  handleMap: HandleMap;
  message: Message;
  onOpen: (messageId: number) => void;
}) => {
  const origin = message.reply_origin;
  if (!origin) {
    return null;
  }
  const originHandle = handleMap[origin.handle_id ?? ""];
  const sender = origin.is_from_me ? "You" : originHandle?.contact?.parsedName || originHandle?.id || "Unknown Sender";
  return (
    <button
      className="message-reply-origin"
      disabled={origin.message_id === null}
      title={`${sender}: ${origin.text || origin.attachmentLabel || "Message"}`}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (origin.message_id !== null) {
          onOpen(origin.message_id);
        }
      }}
    >
      <span className="message-reply-connector" aria-hidden="true" />
      <span className="message-reply-copy">
        <strong>{sender}</strong>
        <span>{origin.text || origin.attachmentLabel || "Message"}</span>
      </span>
    </button>
  );
};

export const MessageBubbleText = ({ text, system }: { system?: boolean; text: string | null }) => {
  const filter = useMimessage((state) => state.filter);

  return (
    <div className="message_part">
      <div className={`bubble${system ? " system-message" : ""}`}>
        {filter ? <Highlighter searchWords={[filter]} autoEscape={true} textToHighlight={text || ""} /> : text}
      </div>
    </div>
  );
};
export const MESSAGE_DATE_DIVIDER_THRESHOLD_NANOS = 1_000_000_000 * 60 * 90;

type PreviousMessageContext = Pick<Message, "date"> &
  Partial<Pick<Message, "item_type" | "other_handle" | "share_direction">>;

export const hasMessageDateDivider = (
  previousMessage: Pick<Message, "date"> | null | undefined,
  message: Pick<Message, "date"> | null | undefined,
) => (message?.date || 0) - (previousMessage?.date || 0) >= MESSAGE_DATE_DIVIDER_THRESHOLD_NANOS;

const formatDateDivider = (date: Date) => {
  const target = dayjs(date);
  const now = dayjs();
  const time = messageTimeFormatter.format(date);
  if (target.isSame(now, "day")) {
    return `Today ${time}`;
  }
  if (target.isSame(now.subtract(1, "day"), "day")) {
    return `Yesterday ${time}`;
  }
  if (now.diff(target, "day") < 7) {
    const weekday = messageWeekdayFormatter.format(date);
    return `${weekday} ${time}`;
  }
  const calendarDate = messageDateFormatter.format(date);
  return `${calendarDate} at ${time}`;
};

export const MessageBubble = React.memo(function MessageBubble({
  showAvatar,
  message,
  previousMessage,
  isGroupedMessage,
  isLastInGroup = true,
  isLastInTranscript = false,
  showTimes,
  recalcSize,
  handleMap,
}: {
  handleMap: HandleMap;
  showAvatar: boolean;
  isGroupedMessage?: boolean;
  isLastInGroup?: boolean;
  isLastInTranscript?: boolean;
  message: null | undefined | Message;
  previousMessage: null | undefined | PreviousMessageContext;
  showTimes: boolean;
  recalcSize?: () => void | undefined;
}) {
  const { setFilter, filter, setMessageIdToBringToFocus } = useMimessage(
    useShallow((state) => ({
      setMessageIdToBringToFocus: state.setMessageIdToBringToFocus,
      filter: state.filter,
      setFilter: state.setFilter,
    })),
  );
  if (!message) {
    return null;
  }
  const handle = handleMap?.[message.handle_id!];
  const contact = handle?.contact;
  const isFromMe = Boolean(message.is_from_me);

  const isIMessage = message.service === "iMessage";
  const isAnnouncement = message.item_type !== 0;
  const attachments = [message, ...(message.attachmentMessages || [])];
  const hasAttachment = attachments.some(
    (attachment) => attachment.attachment_id !== null && (attachment.filename || attachment.mime_type),
  );
  const externalUrl = getExternalHttpUrl(message.link_metadata?.originalUrl || message.text);
  const isRichLink = Boolean(externalUrl && attachments.some(isPluginPayloadAttachment));
  const isStandaloneLink = attachments.length === 1 && Boolean(externalUrl);
  const hasRichContent = hasAttachment || isStandaloneLink;
  const showDateOfMessage = hasMessageDateDivider(previousMessage, message);
  if (isAnnouncement) {
    const isDuplicateOutgoingLocationAnnouncement =
      (message.item_type === 4 || message.item_type === 5) &&
      message.share_direction === 0 &&
      previousMessage?.item_type === message.item_type &&
      previousMessage.share_direction === 0 &&
      previousMessage.other_handle === message.other_handle &&
      Math.abs((message.date || 0) - (previousMessage.date || 0)) <= 2_000_000_000;
    if (isDuplicateOutgoingLocationAnnouncement) {
      return null;
    }
    return (
      <>
        {message.date_obj ? (
          <time className="time-dif message-time-separator" dateTime={message.date_obj.toISOString()}>
            {formatDateDivider(message.date_obj)}
          </time>
        ) : null}
        <AnnouncementBubble handleMap={handleMap} message={message} />
      </>
    );
  }

  const timeText = () => {
    if (!message.date_obj) {
      return null;
    }
    return (
      <time className="message-inline-time" dateTime={message.date_obj.toISOString()}>
        <span>{messageTimestampFormatter.format(message.date_obj)}</span>
      </time>
    );
  };

  const deliveryStatus = (() => {
    if (!isFromMe || !isLastInGroup || !isLastInTranscript) {
      return null;
    }
    if (message.error) {
      return "Not Delivered";
    }
    if (message.date_obj_read) {
      return `Read ${messageReceiptTimeFormatter.format(message.date_obj_read)}`;
    }
    if (message.date_obj_delivered || message.is_delivered) {
      return "Delivered";
    }
    return null;
  })();
  const onClick = () => {
    if (filter) {
      // if we're currently in filter mode, lets jump to the message
      setMessageIdToBringToFocus(message.message_id!);
      setFilter(null);
    }
  };
  return (
    <>
      {showDateOfMessage && message.date_obj && (
        <time className="time-dif message-time-separator" dateTime={message.date_obj.toISOString()}>
          {formatDateDivider(message.date_obj)}
        </time>
      )}
      <div
        onClick={onClick}
        onKeyDown={(event) => {
          if (filter && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onClick();
          }
        }}
        role={filter ? "button" : undefined}
        tabIndex={filter ? 0 : undefined}
        className={`message message-row ${isFromMe ? "from-me" : "from-them"}${
          isGroupedMessage ? " is-grouped" : ""
        }${isLastInGroup ? " is-last-in-group" : ""}${hasRichContent ? " has-attachment" : ""}${
          filter ? " is-filter-result" : ""
        }${message.tapbacks?.length ? " has-tapbacks" : ""}${message.reply_origin ? " has-reply" : ""}`}
        data-direction={isFromMe ? "outgoing" : "incoming"}
        data-service={isIMessage ? "imessage" : "sms"}
      >
        {showTimes && !isFromMe && timeText()}
        {showAvatar && !isFromMe && (
          <div className="message-avatar-slot">
            {isLastInGroup ? <MessageAvatar contact={contact} fallback={contact?.parsedName || "?"} size={28} /> : null}
          </div>
        )}
        <div className={isFromMe ? "sentContainer" : "container"}>
          <ReplyOriginPreview handleMap={handleMap} message={message} onOpen={setMessageIdToBringToFocus} />
          {showAvatar && !isFromMe && !isGroupedMessage && (
            <div className="message-sender-name">{contact?.parsedName || ""}</div>
          )}
          <div
            className={[
              isFromMe ? "sent" : "received",
              hasRichContent ? "media-attachment" : isIMessage ? "imessage" : "sms",
            ].join(" ")}
          >
            {hasRichContent ? (
              <div className="message-attachments" data-count={isRichLink ? 1 : attachments.length}>
                {isRichLink ? (
                  <RichLinkAttachmentView attachments={attachments} message={message} recalcSize={recalcSize} />
                ) : (
                  attachments.map((attachment, index) => (
                    <AttachmentView
                      key={attachment.attachment_id ?? `${attachment.guid}-message`}
                      recalcSize={recalcSize}
                      message={index === 0 ? attachment : { ...attachment, text: null }}
                    />
                  ))
                )}
              </div>
            ) : (
              <MessageBubbleText text={message.text} />
            )}
            <MessageTapbacks handleMap={handleMap} message={message} />
          </div>
        </div>
        {showTimes && isFromMe && timeText()}
      </div>
      {deliveryStatus ? (
        <div
          className={`message-delivery-status${message.error ? " is-error" : ""}`}
          role={message.error ? "status" : undefined}
        >
          {deliveryStatus}
        </div>
      ) : null}
    </>
  );
});

export const AiMessageBubble = React.memo(function AiMessageBubble({
  message,
  showTimes,
}: {
  message: null | undefined | AiMessage;
  showTimes: boolean;
}) {
  if (!message) {
    return null;
  }
  const timeText = () => {
    if (!message.date) {
      return null;
    }
    return (
      <time className="message-inline-time" dateTime={message.date.toISOString()} style={{ paddingRight: 4 }}>
        <span>
          {message.date.toLocaleDateString()} {message.date.toLocaleTimeString()}
        </span>
      </time>
    );
  };

  const isAssistant = message.role === "assistant";
  return (
    <>
      <div className={`message message-row ai-message-row ${isAssistant ? "from-them" : "from-me"}`}>
        <div className={isAssistant ? "card container" : "sentContainer"}>
          <div className={[isAssistant ? "received" : "sent", "imessage"].join(" ")}>
            {message.content ? (
              <MessageBubbleText text={message.content} />
            ) : (
              <div className="typing">
                <span className="typing__bullet" />
                <span className="typing__bullet" />
                <span className="typing__bullet" />
              </div>
            )}
          </div>
        </div>
        {showTimes && timeText()}
      </div>
    </>
  );
});
