import React from "react";
import type { Contact } from "node-mac-contacts";
import { Avatar } from "@mui/material";

export const MessageAvatar = ({ contact, size = 40 }: { size?: number; contact: null | undefined | Contact }) => {
  const getImageData = () => {
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

  const imageData = getImageData();
  return (
    <Avatar
      alt={contact?.parsedName}
      src={imageData ? `data:image/png;base64, ${Buffer.from(imageData).toString("base64")}` : "/nonexistant.jpg"}
      sx={{ width: size, height: size }}
    />
  );
};
