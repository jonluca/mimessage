import React from "react";
import Box from "@mui/material/Box";
import type { Message } from "../interfaces";
import { useHandleMap } from "../hooks/dataHooks";
import { MessageAvatar } from "./Avatar";
import { AssetPlayer } from "./AssetPlayer";
import type { AiMessage } from "../context";

const AnnouncementBubble = ({ message }: { message: Message }) => {
  const itemType = message?.item_type;
  const groupActionType = message?.group_action_type;
  const groupTitle = message?.group_title;
  const otherHandle = message?.other_handle;
  const { data: handleMap } = useHandleMap();
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

export const MessageBubble = ({
  showAvatar,
  message,
  isGroupedMessage,
  showTimes,
}: {
  showAvatar: boolean;
  isGroupedMessage?: boolean;
  message: null | undefined | Message;
  showTimes: boolean;
}) => {
  const { data: handleMap } = useHandleMap();

  if (!message) {
    return null;
  }
  const handle = handleMap?.[message.handle_id!];
  const contact = handle?.contact;
  const isFromMe = Boolean(message.is_from_me);

  const isIMessage = message.service === "iMessage";
  const isAnnouncement = message.item_type !== 0;
  const isMedia = message.attachment_id !== null && message.filename;
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

  return (
    <Box className={"message"} sx={{ mx: 1, my: 0.25 }}>
      {showTimes && !isFromMe && timeText()}
      {showAvatar && !isFromMe && (
        <Box sx={{ pr: 0.5 }}>
          <MessageAvatar contact={contact} size={28} />
        </Box>
      )}
      <Box className={isFromMe ? "sentContainer" : "container"}>
        {showAvatar && !isFromMe && !isGroupedMessage && (
          <Box sx={{ fontSize: 10, color: "#909093", paddingLeft: "12px", pb: 0.25 }}>{contact?.parsedName || ""}</Box>
        )}
        <Box className={[isFromMe ? "sent" : "received", isIMessage ? "imessage" : "sms"].join(" ")}>
          {isMedia ? (
            <Box sx={{ maxHeight: 400, overflow: "hidden" }}>
              <AssetPlayer message={message} />
            </Box>
          ) : (
            <Box className={"message_part"}>
              <Box className={"bubble"}>{message.text}</Box>
            </Box>
          )}
        </Box>
      </Box>
      {showTimes && isFromMe && timeText()}
    </Box>
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

  return (
    <>
      <Box className={"message"} sx={{ mx: 1, my: 0.25 }}>
        <Box className={"sentContainer"}>
          <Box className={["sent", "imessage"].join(" ")}>
            <Box className={"message_part"}>
              <Box className={"bubble"}>{message.content}</Box>
            </Box>
          </Box>
        </Box>
        {showTimes && timeText()}
      </Box>
      <Box className={"message"} sx={{ mx: 1, my: 0.25 }}>
        {showTimes && timeText()}
        <Box className={"card container"}>
          <Box className={["received", "imessage"].join(" ")}>
            {message.response ? (
              <Box className={"message_part"}>
                <Box className={"bubble"}>{message.response.content}</Box>
              </Box>
            ) : (
              <div className="typing">
                <span className="typing__bullet" />
                <span className="typing__bullet" />
                <span className="typing__bullet" />
              </div>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
};
