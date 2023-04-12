import { Button } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import theme from "../theme";
import React from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useMimessage } from "../../context";
export const ImessageWrapped = ({ back }: { back?: boolean }) => {
  const setIsInWrapped = useMimessage((state) => state.setIsInWrapped);
  const setChatId = useMimessage((state) => state.setChatId);

  const openImessageWrapped = () => {
    if (!back) {
      setChatId(null);
    }
    setIsInWrapped(!back);
  };
  const Icon = back ? ArrowBackIcon : AutoFixHighIcon;
  return (
    <Button variant="contained" title={"Open iMessage Wrapped"} sx={{ mb: 1.5, mx: 1.5 }} onClick={openImessageWrapped}>
      <Icon sx={{ mx: 0.5, color: theme.colors.white, fontSize: 18, cursor: "pointer" }} />
      {back ? "Back" : "iMessage Wrapped"}
    </Button>
  );
};
