import React from "react";
import Box from "@mui/material/Box";
import type { Message } from "../../interfaces";
import { useHandleMap } from "../../hooks/dataHooks";
import { MessageAvatar } from "./Avatar";
import { AttachmentView } from "./AttachmentView";
import type { AiMessage } from "../../context";
import dayjs from "dayjs";
import Highlighter from "react-highlight-words";
import { useMimessage } from "../../context";
import { shallow } from "zustand/shallow";

const AnnouncementBubble = ({ message }: { message: Message }) => {
  const itemType = message?.item_type;
  const groupActionType = message?.group_action_type;
  const groupTitle = message?.group_title;
  const otherHandle = message?.other_handle;
  const handleMap = useHandleMap();
  const handle = handleMap?.[message.handle_id!];
  const contact = handle?.contact;
  const name = contact?.parsedName || "You";
  let text = "";
  if (itemType == 1 && groupActionType == 1) {
    const otherContact = handleMap?.[otherHandle!]?.contact;
    const otherName = otherContact?.parsedName || "other";
    text = `${name} removed ${otherName} from the conversation`;
  } else if (itemType == 1 && groupActionType == 0) {
    const otherContact = handleMap?.[otherHandle!]?.contact;
    const otherName = otherContact?.parsedName || "other";
    text = `${name} added ${otherName} to the conversation`;
  } else if (itemType == 3 && (groupActionType ?? 0) > 0) {
    text = `${name} changed the group photo`;
  } else if (itemType == 3) {
    text = `${name} left the conversation`;
  } else if (itemType == 2 && groupTitle != null) {
    text = `${name} named the conversation "${groupTitle}"`;
  } else if (itemType == 6) {
    text = `${name} started a FaceTime call`;
  } else if (itemType == 4 && groupActionType == 0) {
    text = `${name} started sharing ${name == "You" ? "your" : "their"} location`;
  }
  return <Box className={"announcement"}>{text}</Box>;
};

export const MessageBubbleText = ({ text, system }: { system?: boolean; text: string | null }) => {
  const filter = useMimessage((state) => state.filter);

  return (
    <Box className={"message_part"}>
      <Box className={"bubble"} sx={{ color: system ? "red" : undefined }}>
        {filter ? <Highlighter searchWords={[filter]} autoEscape={true} textToHighlight={text || ""} /> : text}
      </Box>
    </Box>
  );
};
const NINETY_MINUTES_NANOS = 1_000_000_000 * 60 * 90;
export const MessageBubble = ({
  showAvatar,
  message,
  previousMessage,
  isGroupedMessage,
  showTimes,
  recalcSize,
}: {
  showAvatar: boolean;
  isGroupedMessage?: boolean;
  message: null | undefined | Message;
  previousMessage: null | undefined | Message;
  showTimes: boolean;
  recalcSize?: () => void | undefined;
}) => {
  const handleMap = useHandleMap();
  const { setFilter, filter, setMessageIdToBringToFocus } = useMimessage(
    (state) => ({
      setMessageIdToBringToFocus: state.setMessageIdToBringToFocus,
      filter: state.filter,
      setFilter: state.setFilter,
    }),
    shallow,
  );
  if (!message) {
    return null;
  }
  const handle = handleMap?.[message.handle_id!];
  const contact = handle?.contact;
  const isFromMe = Boolean(message.is_from_me);

  const isIMessage = message.service === "iMessage";
  const isAnnouncement = message.item_type !== 0;
  const isMedia = message.attachment_id !== null && (message.filename || message.mime_type);
  if (isAnnouncement) {
    return <AnnouncementBubble message={message} />;
  }

  const timeText = () => {
    if (!message.date_obj) {
      return null;
    }
    return (
      <Box sx={{ pr: 0.5 }}>
        <span style={{ color: "#909093", fontSize: 9 }}>
          {message.date_obj.toLocaleDateString()} {message.date_obj.toLocaleTimeString()}
        </span>
      </Box>
    );
  };

  const showDateOfMessage = (message?.date || 0) - (previousMessage?.date || 0) > NINETY_MINUTES_NANOS;
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
        <Box className={"time-dif"}>{dayjs(message.date_obj).format("dddd, MMMM D, YYYY HH:mm A")}</Box>
      )}
      <Box onClick={onClick} className={"message"} sx={{ mx: 1, my: 0.25, cursor: filter ? "pointer" : undefined }}>
        {showTimes && !isFromMe && timeText()}
        {showAvatar && !isFromMe && (
          <Box sx={{ pr: 0.5 }}>
            <MessageAvatar contact={contact} size={28} />
          </Box>
        )}
        <Box className={isFromMe ? "sentContainer" : "container"}>
          {showAvatar && !isFromMe && !isGroupedMessage && (
            <Box sx={{ fontSize: 10, color: "#909093", paddingLeft: "12px", pb: 0.25 }}>
              {contact?.parsedName || ""}
            </Box>
          )}
          <Box
            className={[
              isFromMe ? "sent" : "received",
              isMedia ? "media-attachment" : isIMessage ? "imessage" : "sms",
            ].join(" ")}
          >
            {isMedia ? (
              <Box sx={{ overflow: "hidden" }}>
                <AttachmentView recalcSize={recalcSize} message={message} />
              </Box>
            ) : (
              <MessageBubbleText text={message.text} />
            )}
          </Box>
        </Box>
        {showTimes && isFromMe && timeText()}
      </Box>
    </>
  );
};

export const AiMessageBubble = ({
  message,
  showTimes,
}: {
  message: null | undefined | AiMessage;
  showTimes: boolean;
}) => {
  if (!message) {
    return null;
  }
  const timeText = () => {
    if (!message.date) {
      return null;
    }
    return (
      <Box sx={{ pr: 0.5 }}>
        <span style={{ color: "#909093", fontSize: 9 }}>
          {message.date.toLocaleDateString()} {message.date.toLocaleTimeString()}
        </span>
      </Box>
    );
  };

  const isAssistant = message.role === "assistant";
  return (
    <>
      <Box className={"message"} sx={{ mx: 1, my: 0.25 }}>
        <Box className={isAssistant ? "card container" : "sentContainer"}>
          <Box className={[isAssistant ? "received" : "sent", "imessage"].join(" ")}>
            {message.content ? (
              <MessageBubbleText text={message.content} />
            ) : (
              <div className="typing">
                <span className="typing__bullet" />
                <span className="typing__bullet" />
                <span className="typing__bullet" />
              </div>
            )}
          </Box>
        </Box>
        {showTimes && timeText()}
      </Box>
    </>
  );
};
