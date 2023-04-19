import "react-day-picker/dist/style.css";
import "react-toastify/dist/ReactToastify.css";
import "../styles/globals.css";
import "../styles/ai-magic.css";

import { register } from "../config/registerEventHandlers";
import type { AppProps } from "next/app";
import React, { useEffect } from "react";
import { styled, ThemeProvider } from "@mui/material/styles";
import type { EmotionCache } from "@emotion/react";
import { CacheProvider } from "@emotion/react";
import createEmotionCache from "../config/emotionCache";
import theme from "../components/theme";
import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { isProd } from "../config";
import { KeyPress } from "../utils/KeyPress";
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);
dayjs.extend(relativeTime);
import { ToastContainer } from "react-toastify";

import { useDoesLocalDbExist, useHasAllowedPermissions, useInitialize, useIsInitialized } from "../hooks/dataHooks";
import { Onboarding } from "../components/Onboarding";
import { CircularProgress } from "@mui/material";
import { openAiLocalStorageKey, useMimessage } from "../context";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Backdrop from "@mui/material/Backdrop";

const Container = styled("div")`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  user-select: ${() => (isProd ? "none" : "auto")};
`;
interface ProviderProps extends AppProps {
  emotionCache?: EmotionCache;
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      networkMode: "always",
    },
  },
});
const clientSideEmotionCache = createEmotionCache();

const Initializing = () => {
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
          width: "100%",
        }}
      >
        <Typography variant={"h1"}>{"Setup"}</Typography>
        <Typography variant={"h4"}>Initializing database...</Typography>
        <CircularProgress />
      </Box>
    </Backdrop>
  );
};
export const MimessageApp = ({ Component, pageProps }: AppProps) => {
  const { data: localDbExists } = useDoesLocalDbExist();
  const { data: isInitialized } = useIsInitialized();
  const { data: permissions } = useHasAllowedPermissions();
  const setOpenAiKey = useMimessage((state) => state.setOpenAiKey);
  const hasDiskAccess = permissions?.diskAccessStatus === "authorized";
  const hasContactsAccess = permissions?.contactsStatus === "authorized";
  const { mutateAsync } = useInitialize();
  const isInOnboarding = localDbExists === false || !hasDiskAccess || !hasContactsAccess;
  useEffect(() => {
    global.store
      .get(openAiLocalStorageKey)
      .then((key) => {
        if (key) {
          setOpenAiKey(key);
        }
      })
      .catch((e) => {
        console.error(e);
      });
  }, [setOpenAiKey]);

  useEffect(() => {
    if (localDbExists === true) {
      mutateAsync();
    }
  }, [localDbExists, mutateAsync]);

  const render = () => {
    if (isInOnboarding) {
      return <Onboarding />;
    }

    if (isInitialized === false) {
      return <Initializing />;
    }
    if (localDbExists === true && isInitialized) {
      return <Component {...pageProps} />;
    }
    return <CircularProgress />;
  };

  return <Container>{render()}</Container>;
};

export const ProvidedApp = (props: ProviderProps) => {
  const { emotionCache = clientSideEmotionCache, ...rest } = props;

  useEffect(() => {
    register();
    KeyPress.init();
    return () => {
      KeyPress.cleanup();
    };
  }, []);

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <MimessageApp {...rest} />
          {!isProd && <ReactQueryDevtools />}
          <ToastContainer />
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
};

export default ProvidedApp;
