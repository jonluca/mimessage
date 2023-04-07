import React from "react";
import Box from "@mui/material/Box";
import { Home } from "../components/Home";
import { useCopyDbMutation, useDoesLocalDbExist } from "../hooks/dataHooks";
import { CircularProgress } from "@mui/material";
import Backdrop from "@mui/material/Backdrop";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

const Index = () => {
  const { data, isLoading, refetch } = useDoesLocalDbExist();
  const { mutateAsync, isLoading: isCopying } = useCopyDbMutation();
  const onCopy = async () => {
    await mutateAsync();
    await refetch();
  };
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
      {data === true ? (
        <Home />
      ) : data === false ? (
        <Backdrop open={true}>
          <Box sx={{ background: "#2c2c2c", m: 1, p: 1, maxWidth: 500 }}>
            <Typography variant={"h1"}>Setup</Typography>
            <Typography variant={"body1"}>
              Mimessage needs to analyze and parse your messages. This should take between 2 - 15 seconds, depending on
              how many messages you have.
            </Typography>
            {(isCopying || isLoading) && <CircularProgress />}
            <Button onClick={onCopy}>Copy</Button>
          </Box>
        </Backdrop>
      ) : (
        <CircularProgress />
      )}
    </Box>
  );
};

export default Index;
