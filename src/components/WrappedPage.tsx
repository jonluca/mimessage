import React from "react";
import Box from "@mui/material/Box";
import { NoSsr } from "@mui/material";
import { WrappedList } from "./wrapped/WrappedList";
import { SelectedWrap } from "./wrapped/SelectedWrap";

export const WrappedPage = () => {
  return (
    <Box
      display={"flex"}
      flexDirection={"row"}
      width={"100%"}
      height={"100%"}
      sx={{ background: "none", borderRadius: 1 }}
    >
      <NoSsr>
        <WrappedList />
      </NoSsr>
      <SelectedWrap />
    </Box>
  );
};
