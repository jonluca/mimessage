import "../styles/globals.css";
import "../styles/messages.css";

import { register } from "../config/registerEventHandlers";
import type { AppProps } from "next/app";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import { useDoesLocalDbExist, useHasAllowedPermissions, useInitialize, useIsInitialized } from "../hooks/dataHooks";
import { Onboarding } from "../components/Onboarding";
import {
  aiPersonaStorageKey,
  openAiLocalStorageKey,
  relationStorageKey,
  semanticSearchStorageKey,
  useMimessage,
} from "../context";
import { NativeModal } from "../components/NativeModal";

type QueryErrorListener = (message: string | null) => void;

let latestQueryError: string | null = null;
const queryErrorListeners = new Set<QueryErrorListener>();

const publishQueryError = (message: string | null) => {
  latestQueryError = message;
  queryErrorListeners.forEach((listener) => listener(message));
};

const QueryErrorNotice = () => {
  const [message, setMessage] = useState(latestQueryError);

  useEffect(() => {
    queryErrorListeners.add(setMessage);
    return () => {
      queryErrorListeners.delete(setMessage);
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div className="app-inline-notice" role="alert">
      <strong>Couldn’t update Messages</strong>
      <span>{message}</span>
      <button type="button" aria-label="Dismiss error" onClick={() => publishQueryError(null)}>
        Dismiss
      </button>
    </div>
  );
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      console.error(error);
      publishQueryError(error.message);
    },
  }),
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

const Initializing = ({
  error,
  onRetry,
  stage = "initializing",
}: {
  error: Error | null;
  onRetry?: () => void;
  stage?: "checking" | "initializing";
}) => {
  const title = error ? "Mimessage Couldn’t Open" : stage === "checking" ? "Opening Mimessage" : "Setting Up Mimessage";
  const description = error
    ? "Setup couldn’t be completed."
    : stage === "checking"
      ? "Checking your Messages library and permissions…"
      : "Preparing your message history…";

  return (
    <NativeModal className="setup-backdrop" open>
      <dialog
        open
        className="messages-modal messages-assistant setup-modal setup-initializing"
        aria-modal="true"
        aria-labelledby="initializing-title"
        aria-describedby="initializing-description"
        aria-busy={!error}
      >
        <header className="messages-modal-header setup-header">
          <h1 id="initializing-title" className="messages-modal-title setup-title">
            {title}
          </h1>
          <p id="initializing-description" className="messages-modal-subtitle setup-subtitle">
            {description}
          </p>
        </header>
        {error ? (
          <>
            <div className="messages-modal-content setup-error" role="alert">
              <p className="messages-inline-error setup-error-message">{error.message}</p>
            </div>
            <footer className="messages-modal-actions setup-actions">
              <button
                type="button"
                className="messages-modal-button messages-modal-button--primary setup-primary-button"
                onClick={onRetry}
              >
                Try Again
              </button>
            </footer>
          </>
        ) : (
          <div className="messages-modal-content setup-progress" role="status">
            <span className="native-spinner" aria-label="Preparing message history" />
          </div>
        )}
      </dialog>
    </NativeModal>
  );
};
export const MimessageApp = ({ Component, pageProps, router }: AppProps) => {
  const isSettingsPage = router.pathname === "/settings";
  const { data: localDbExists } = useDoesLocalDbExist();
  const { data: permissions } = useHasAllowedPermissions();
  const setOpenAiKey = useMimessage((state) => state.setOpenAiKey);
  const setAiPersonaInstructions = useMimessage((state) => state.setAiPersonaInstructions);
  const setRelation = useMimessage((state) => state.setRelation);
  const setUseSemanticSearch = useMimessage((state) => state.setUseSemanticSearch);
  const hasDiskAccess = permissions?.diskAccessStatus === "authorized";
  const hasContactsAccess = permissions?.contactsStatus === "authorized";
  const isCheckingPrerequisites = localDbExists === undefined || permissions === undefined;
  const canInitialize = localDbExists === true && hasDiskAccess && hasContactsAccess;
  const { data: isInitialized } = useIsInitialized(canInitialize);
  const { error: initializationError, mutateAsync, reset: resetInitialization } = useInitialize();
  const initializationStarted = useRef(false);
  const isInOnboarding = !isCheckingPrerequisites && (localDbExists === false || !hasDiskAccess || !hasContactsAccess);
  useEffect(() => {
    Promise.all([global.store.get(openAiLocalStorageKey), global.store.get(semanticSearchStorageKey)])
      .then(([savedKey, semanticSearchEnabled]) => {
        const openAiKey = typeof savedKey === "string" && savedKey.trim() ? savedKey.trim() : null;
        setOpenAiKey(openAiKey);
        setUseSemanticSearch(Boolean(openAiKey) && semanticSearchEnabled === true);
      })
      .catch((error) => console.error("Unable to restore OpenAI preferences", error));
  }, [setOpenAiKey, setUseSemanticSearch]);

  useEffect(() => {
    Promise.all([global.store.get(relationStorageKey), global.store.get(aiPersonaStorageKey)])
      .then(([savedRelation, savedInstructions]) => {
        if (typeof savedRelation === "string" && savedRelation) {
          setRelation(savedRelation);
        }
        if (typeof savedInstructions === "string") {
          setAiPersonaInstructions(savedInstructions);
        }
      })
      .catch((error) => console.error("Unable to restore AI message preferences", error));
  }, [setAiPersonaInstructions, setRelation]);

  const startInitialization = useCallback(() => {
    if (initializationStarted.current) {
      return;
    }
    initializationStarted.current = true;
    resetInitialization();
    void mutateAsync().catch((error) => {
      initializationStarted.current = false;
      console.error(error);
    });
  }, [mutateAsync, resetInitialization]);

  useEffect(() => {
    if (!isSettingsPage && canInitialize && isInitialized === false && !initializationError) {
      startInitialization();
    }
  }, [canInitialize, initializationError, isInitialized, isSettingsPage, startInitialization]);

  const render = () => {
    if (isSettingsPage) {
      return <Component {...pageProps} />;
    }
    if (isCheckingPrerequisites) {
      return <Initializing error={null} stage="checking" />;
    }

    if (isInOnboarding) {
      return <Onboarding />;
    }

    if (isInitialized === undefined) {
      return <Initializing error={null} stage="checking" />;
    }

    if (isInitialized === false || initializationError) {
      return <Initializing error={initializationError} onRetry={startInitialization} />;
    }
    if (localDbExists === true && isInitialized) {
      return <Component {...pageProps} />;
    }
    return <Initializing error={null} stage="checking" />;
  };

  return <div className={`mimessage-app-root${isProd ? " is-production" : ""}`}>{render()}</div>;
};

export const ProvidedApp = (props: AppProps) => {
  useEffect(() => {
    register();
    KeyPress.init();
    return () => {
      KeyPress.cleanup();
    };
  }, []);

  useEffect(() => {
    const updateWindowActivation = () => {
      document.documentElement.classList.toggle("window-inactive", !document.hasFocus());
    };
    updateWindowActivation();
    window.addEventListener("focus", updateWindowActivation);
    window.addEventListener("blur", updateWindowActivation);
    return () => {
      window.removeEventListener("focus", updateWindowActivation);
      window.removeEventListener("blur", updateWindowActivation);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="mimessage-app-stack">
        <QueryErrorNotice />
        <MimessageApp {...props} />
      </div>
      {!isProd && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
};

export default ProvidedApp;
