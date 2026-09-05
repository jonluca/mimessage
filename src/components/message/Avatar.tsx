import React from "react";
import type { Contact } from "electron-mac-contacts";
import Avatar from "./BaseAvatar";

export const MessageAvatar = ({
  contact,
  size = 40,
  fallback,
}: {
  size?: number;
  fallback?: string;
  contact: null | undefined | Contact;
}) => {
  const src = contact?.pngBase64;
  return (
    <Avatar
      className="message-avatar"
      alt={contact?.parsedName || fallback}
      src={src}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) }}
    />
  );
};
