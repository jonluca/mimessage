import React from "react";
import Box from "@mui/material/Box";
import { Home } from "../components/Home";

const Index = () => {
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
      <Home />
    </Box>
  );
};

export default Index;
