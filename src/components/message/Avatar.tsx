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
  return <Avatar alt={contact?.parsedName || fallback} src={src} sx={{ width: size, height: size }} />;
};
