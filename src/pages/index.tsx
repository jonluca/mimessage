import React from "react";
import Box from "@mui/material/Box";
import { Home } from "../components/Home";
import { useDoesLocalDbExist, useHasAllowedPermissions } from "../hooks/dataHooks";
import { CircularProgress } from "@mui/material";
import { Onboarding } from "../components/Onboarding";

const Index = () => {
  const { data: localDbExists } = useDoesLocalDbExist();
  const { data: permissions } = useHasAllowedPermissions();
  const hasDiskAccess = permissions?.diskAccessStatus === "authorized";
  const hasContactsAccess = permissions?.contactsStatus === "authorized";

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
      {localDbExists === false || !hasDiskAccess || !hasContactsAccess ? (
        <Onboarding />
      ) : localDbExists === true ? (
        <Home />
      ) : (
        <CircularProgress />
      )}
    </Box>
  );
};

export default Index;
