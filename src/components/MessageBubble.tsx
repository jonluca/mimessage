import React from "react";
import Box from "@mui/material/Box";
import type { Message } from "../interfaces";
import { useHandleMap } from "../hooks/dataHooks";
import { getContactName } from "../utils/helpers";

const AnnouncementBubble = ({ message }: { message: Message }) => {
  const itemType = message?.item_type;
  const groupActionType = message?.group_action_type;
  const groupTitle = message?.group_title;
  const otherHandle = message?.other_handle;
  const { data: handleMap } = useHandleMap();
  const handle = handleMap?.[message.handle_id!];
  const contact = handle?.contact;
  let name = "You";
  if (contact) {
    name = getContactName(contact);
  }
  let text = "";
  if (itemType == 1 && groupActionType == 1) {
    const otherContact = handleMap?.[otherHandle!]?.contact;
    const otherName = getContactName(otherContact);
    text = `${name} removed ${otherName} from the conversation`;
  } else if (itemType == 1 && groupActionType == 0) {
    const otherContact = handleMap?.[otherHandle!]?.contact;
    const otherName = getContactName(otherContact);
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
export const MessageBubble = ({ message }: { message: null | undefined | Message }) => {
  if (!message) {
    return null;
  }

  const isFromMe = message.is_from_me;

  const isIMessage = message.service === "iMessage";
  const isAnnouncement = message.item_type !== 0;
  if (isAnnouncement) {
    return <AnnouncementBubble message={message} />;
  }
  return (
    <Box className={"message"}>
      <Box className={[isFromMe ? "sent" : "received", isIMessage ? "imessage" : "sms"].join(" ")}>
        <Box className={"message_part"}>
          <Box className={"bubble"}>{message.text}</Box>
        </Box>
      </Box>
    </Box>
  );
};
