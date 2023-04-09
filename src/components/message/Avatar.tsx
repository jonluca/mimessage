import React from "react";
import type { Contact } from "node-mac-contacts";
import { Avatar } from "@mui/material";

const getImageData = (contact: Contact | null | undefined) => {
  if (!contact) {
    return null;
  }
  if (contact.contactThumbnailImage?.length) {
    return contact.contactThumbnailImage;
  }
  if (contact.contactImage?.length) {
    return contact.contactImage;
  }
  return null;
};

export const MessageAvatar = ({ contact, size = 40 }: { size?: number; contact: null | undefined | Contact }) => {
  const imageData = getImageData(contact);

  const src = React.useMemo(() => {
    if (!imageData) {
      return "/nonexistant.jpg";
    }
    return `data:image/png;base64, ${Buffer.from(imageData).toString("base64")}`;
  }, [imageData]);

  return <Avatar alt={contact?.parsedName} src={src} sx={{ width: size, height: size }} />;
};
