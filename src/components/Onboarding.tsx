import React from "react";
import Backdrop from "@mui/material/Backdrop";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import {
  useCopyDbMutation,
  useDoesLocalDbExist,
  useHasAllowedPermissions,
  useRequestAccessMutation,
} from "../hooks/dataHooks";
import { Check, Close } from "@mui/icons-material";

const PermissionsDialog = ({ denied, allowed, copy }: { denied: boolean; allowed: boolean; copy: text }) => {
  return (
    <Box display={"flex"} justifyContent={"center"}>
      {denied ? (
        <Close sx={{ color: "green" }} />
      ) : allowed ? (
        <Check sx={{ color: "red" }} />
      ) : (
        <CircularProgress color={"secondary"} size={"20px"} />
      )}
      <Typography sx={{ px: 1 }} variant={"body1"}>
        {copy}
      </Typography>
    </Box>
  );
};
export const Onboarding = () => {
  const { isLoading, refetch } = useDoesLocalDbExist();
  const { data: permissions, isLoading: isLoadingPerms } = useHasAllowedPermissions();
  const { mutateAsync: copyDb, isLoading: isCopying } = useCopyDbMutation();
  const { mutateAsync: requestPerms, isLoading: isRequestingPerms } = useRequestAccessMutation();

  const hasDiskAccess = permissions?.diskAccessStatus === "authorized";
  const hasContactsAccess = permissions?.contactsStatus === "authorized";

  const diskIsDenied = permissions?.diskAccessStatus === "denied";
  const contactsIsDenied = permissions?.contactsStatus === "denied";

  const isPastPermissions = hasDiskAccess && hasContactsAccess;
  const onCopy = async () => {
    if (isPastPermissions) {
      await copyDb();
      await refetch();
    } else {
      await requestPerms();
    }
  };

  const showSpinner = isCopying || isLoading || isRequestingPerms || isLoadingPerms;
  return (
    <Backdrop open={true}>
      <Box
        sx={{
          background: "#2c2c2c",
          m: 2,
          p: 2,
          maxWidth: 500,
          minHeight: 300,
          display: "flex",
          justifyContent: "space-between",
          flexDirection: "column",
        }}
      >
        <Typography variant={"h1"}>{isPastPermissions ? "Setup" : "Permissions"}</Typography>
        {isPastPermissions ? (
          <Typography variant={"body1"}>
            Mimessage needs to analyze and parse your messages. This should take between 2 - 15 seconds, depending on
            how many messages you have.
          </Typography>
        ) : (
          <>
            <Typography variant={"body1"}>
              Mimessage needs to be able to read your messages and contacts to function properly.
            </Typography>
            <Box display={"flex"}>
              <PermissionsDialog denied={contactsIsDenied} allowed={hasContactsAccess} copy={"Contacts Access"} />
            </Box>
            <Box display={"flex"}>
              <PermissionsDialog denied={diskIsDenied} allowed={hasDiskAccess} copy={"Full Disk Access"} />
            </Box>
          </>
        )}
        <Box>
          <Button disabled={showSpinner} onClick={onCopy} variant={"contained"}>
            {showSpinner ? <CircularProgress color={"secondary"} /> : <>{isPastPermissions ? "Go" : "Grant Access"}</>}
          </Button>
        </Box>
      </Box>
    </Backdrop>
  );
};
