import { useRouter } from "next/router";
import { Button } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import theme from "../theme";
import React from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
export const ImessageWrapped = ({ back }: { back?: boolean }) => {
  const router = useRouter();
  const openImessageWrapped = () => {
    // do
    router.push(back ? "/" : "/wrapped");
  };
  const Icon = back ? ArrowBackIcon : AutoFixHighIcon;
  return (
    <Button variant="contained" title={"Open iMessage Wrapped"} sx={{ mb: 1.5, mx: 1.5 }} onClick={openImessageWrapped}>
      <Icon sx={{ mx: 0.5, color: theme.colors.white, fontSize: 18, cursor: "pointer" }} />
      {back ? "Back" : "iMessage Wrapped"}
    </Button>
  );
};
