import React from "react";
import Box from "@mui/material/Box";
import { WrappedPage } from "../components/WrappedPage";

const Page = () => {
  return (
    <Box
      display={"flex"}
      flexDirection={"column"}
      width={"100%"}
      height={"100%"}
      alignItems={"center"}
      alignContent={"center"}
      sx={{ background: "black" }}
    >
      <WrappedPage />
    </Box>
  );
};

export default Page;
