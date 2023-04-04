import "../styles/globals.css";
import "../styles/virtualized.css";
import "../styles/Calendar.css";
import { register } from "../config/registerEventHandlers";
import type { AppProps } from "next/app";
import React, { useEffect, useState } from "react";
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
import { Workbox } from "workbox-window";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { isProd } from "../config";
import { KeyPress } from "../utils/KeyPress";
import { useRouter } from "next/router";
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);
dayjs.extend(relativeTime);

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
      keepPreviousData: true,
    },
  },
});
const clientSideEmotionCache = createEmotionCache();

export const MimessageApp = ({ Component, pageProps }: AppProps) => {
  return (
    <Container>
      <Component {...pageProps} />
    </Container>
  );
};

const ServiceWorkerAndCache = () => {
  const [wb, setWb] = useState<Workbox | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !isProd) {
      return;
    }
    const wb = new Workbox("sw.js", { scope: "/" });
    caches
      .keys()
      .then((cacheNames) => {
        cacheNames.forEach((cacheName) => {
          caches.delete(cacheName);
        });
      })
      .then(() => {
        wb.register().then(async () => {
          setWb(wb);
        });
      });
  }, []);

  return null;
};
export const ProvidedApp = (props: ProviderProps) => {
  const { emotionCache = clientSideEmotionCache, ...rest } = props;

  const { pathname } = useRouter();
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
          <ServiceWorkerAndCache />
          {!isProd && <ReactQueryDevtools />}
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
};

export default ProvidedApp;
