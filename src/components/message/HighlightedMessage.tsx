import { useMimessage } from "../../context";
import React from "react";
import Backdrop from "@mui/material/Backdrop";
import { AttachmentView } from "./AttachmentView";
import Box from "@mui/material/Box";

export const HighlightedMessage = () => {
  const highlightedMessage = useMimessage((state) => state.highlightedMessage);
  const setHighlightedMessage = useMimessage((state) => state.setHighlightedMessage);
  const handleClose = () => {
    setHighlightedMessage(null);
  };

  if (!highlightedMessage) {
    return null;
  }

  return (
    <Backdrop sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }} open onClick={handleClose}>
      <Box sx={{ maxHeight: "90vh", display: "flex", height: "100%", width: "100%" }}>
        <AttachmentView message={highlightedMessage} />
      </Box>
    </Backdrop>
  );
};
