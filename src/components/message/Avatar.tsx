import React from "react";
import type { Contact } from "node-mac-contacts";
import { Avatar } from "@mui/material";

export const MessageAvatar = ({ contact, size = 40 }: { size?: number; contact: null | undefined | Contact }) => {
  const src = contact?.pngBase64 || "/nonexistant.jpg";

  return <Avatar alt={contact?.parsedName} src={src} sx={{ width: size, height: size }} />;
};
