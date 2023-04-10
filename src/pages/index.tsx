import React from "react";
import Box from "@mui/material/Box";
import { Home } from "../components/Home";
import { useMimessage } from "../context";

const Index = () => {
  const setChatId = useMimessage((state) => state.setChatId);
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChatId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return (
    <Box
      display={"flex"}
      flexDirection={"column"}
      width={"100%"}
      height={"100%"}
      alignItems={"center"}
      alignContent={"center"}
      overflow={"hidden"}
    >
      <Home />
    </Box>
  );
};

export default Index;
