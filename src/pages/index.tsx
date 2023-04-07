import React from "react";
import Box from "@mui/material/Box";
import { Home } from "../components/Home";
import {
  useCopyDbMutation,
  useDoesLocalDbExist,
  useHasFullDiskAccessPermissions,
  useRequestAccessMutation,
} from "../hooks/dataHooks";
import { CircularProgress } from "@mui/material";
import Backdrop from "@mui/material/Backdrop";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

const Index = () => {
  const { data, isLoading, refetch } = useDoesLocalDbExist();
  const { data: hasFullDiskAccess, refetch: refetchFullDiskAccess } = useHasFullDiskAccessPermissions();
  const { mutateAsync, isLoading: isCopying } = useCopyDbMutation();
  const { mutateAsync: requestPerms, isLoading: isRequestingPerms } = useRequestAccessMutation();
  const onCopy = async () => {
    await requestPerms();
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
      {data === false || !hasFullDiskAccess ? (
        <Backdrop open={true}>
          <Box sx={{ background: "#2c2c2c", m: 1, p: 1, maxWidth: 500 }}>
            <Typography variant={"h1"}>Setup & Permissions</Typography>
            <Typography variant={"body1"}>
              Mimessage needs to be able to read your messages and contacts to function properly.
            </Typography>
            <Typography variant={"body1"}>
              Mimessage needs to analyze and parse your messages. This should take between 2 - 15 seconds, depending on
              how many messages you have.
            </Typography>
            {(isCopying || isLoading) && <CircularProgress />}
            <Button onClick={onCopy}>Grant Access & Run</Button>
          </Box>
        </Backdrop>
      ) : data === true ? (
        <Home />
      ) : (
        <CircularProgress />
      )}
    </Box>
  );
};

export default Index;
