import type { Dispatch, SetStateAction } from "react";
import React, { useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import { Button, LinearProgress, TextField } from "@mui/material";
import Backdrop from "@mui/material/Backdrop";
import Typography from "@mui/material/Typography";
import { toast } from "react-toastify";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import {
  useCreateSemanticEmbeddings,
  useEmbeddingsCreationProgress,
  useMessageCount,
  useSemanticSearchStats,
} from "../../hooks/dataHooks";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import prettyMilliseconds from "pretty-ms";

export const OpenAiKey = () => {
  const setOpenAiKey = useMimessage((state) => state.setOpenAiKey);
  const [aiKeyModalOpen, setAiKeyModalOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const onSubmit = () => {
    const key = ref.current?.value;
    if (key) {
      if (!key.startsWith("sk-") || key.length !== 51) {
        toast("Invalid OpenAI API key - must start with sk- and be 51 chars long", { type: "error" });
        return;
      }
      setOpenAiKey(key ?? null);
    } else {
      setOpenAiKey(null);
    }
    setAiKeyModalOpen(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "row", pt: 1 }}>
      <Backdrop open={aiKeyModalOpen}>
        <Box sx={{ background: "#2c2c2c", p: 1, m: 1 }} display={"flex"} flexDirection={"column"}>
          <Typography variant="h1" sx={{ color: "white" }}>
            OpenAI Key
          </Typography>
          <input
            ref={ref}
            placeholder={"Enter your OpenAI API key"}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSubmit()}
          />
          <Button onClick={onSubmit}>Close and submit</Button>
        </Box>
      </Backdrop>
      <Button onClick={() => setAiKeyModalOpen(true)}>Please set OpenAI API key to use AI Messenger</Button>
    </Box>
  );
};

const humanReadableMinutes = (minutes: number) => {
  if (isNaN(minutes) || minutes === 0 || minutes === Infinity) {
    return "Unknown";
  }

  return prettyMilliseconds(minutes * 60 * 1000, { verbose: true, secondsDecimalDigits: 0 });
};

const SemanticSearchModal = ({
  modalOpen,
  setModalOpen,
}: {
  modalOpen: boolean;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const { openAiKey, setOpenAiKey } = useMimessage((state) => state);
  const [showStats, setShowStats] = useState(false);
  const [startTime, setStartTime] = useState<null | Dayjs>(null);
  const { mutateAsync, isLoading: isCreatingEmbeddings } = useCreateSemanticEmbeddings();
  const { data: stats, isFetching } = useSemanticSearchStats(modalOpen && showStats);
  const { data: numCompleted } = useEmbeddingsCreationProgress();

  const { data: count } = useMessageCount();
  const ref = useRef<HTMLInputElement>(null);
  const onSubmit = async () => {
    if (isCreatingEmbeddings) {
      return;
    }
    const key = ref.current?.value;
    if (!key) {
      toast("Please enter all API information", { type: "error" });
      return;
    }
    if (!key.startsWith("sk-") || key.length !== 51) {
      toast("Invalid OpenAI API key - must start with sk- and be 51 chars long", { type: "error" });
      return;
    }
    setOpenAiKey(key ?? null);

    setStartTime(dayjs());
    try {
      await mutateAsync({
        openAiKey: key,
      });
    } catch (e) {
      console.error(e);
    }
    setStartTime(null);
    setModalOpen(false);
  };

  const hasProgressInEmbeddings = Boolean(isCreatingEmbeddings && stats);
  const completed = numCompleted || 0;
  const totalMessages = stats?.totalMessages || count || 0;
  const completedThisSession = Math.max(completed - (stats?.completedAlready || 0), 0);
  const leftToComplete = (stats?.totalMessages || 0) - completed;
  const timeElapsed = startTime ? dayjs().diff(startTime, "seconds") / 60 : 0;
  const timeRemaining = stats ? humanReadableMinutes(leftToComplete / (completedThisSession / timeElapsed)) : "";

  return (
    <Backdrop onClick={() => !hasProgressInEmbeddings && setModalOpen(false)} open={modalOpen}>
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{ background: "#2c2c2c", maxWidth: 600, p: 2, m: 2 }}
        display={"flex"}
        flexDirection={"column"}
      >
        <Typography variant="h1" sx={{ color: "white" }}>
          Semantic Search
        </Typography>
        <Typography variant="body1" sx={{ color: "white" }}>
          You can use AI to search through your messages. To enable this feature, please enter your OpenAI API key
          below. Note: this will take a <i>long</i> time and might cost you a bit.{" "}
          {showStats && "The estimates are below."}
        </Typography>

        {isFetching && <LinearProgress />}
        {hasProgressInEmbeddings ? (
          <Box>
            <LinearProgress variant="determinate" value={(completed / totalMessages) * 100} />
            <Box sx={{ my: 1, fontSize: 20 }}>
              {completed.toLocaleString()} completed / {totalMessages.toLocaleString()} total
            </Box>
          </Box>
        ) : (
          <>
            <TextField
              defaultValue={openAiKey}
              placeholder={"Enter your OpenAI API key"}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSubmit()}
              sx={{ mt: 1 }}
              inputProps={{ ref }}
            />
          </>
        )}
        {stats && (
          <Box sx={{ display: "flex", my: 2 }}>
            <Box>
              <Typography>Total Unique Messages: {totalMessages.toLocaleString()}</Typography>
              <Typography>Total Tokens: {stats.totalTokens.toLocaleString()}</Typography>
              <Typography>Avg Tokens / msg: {stats.averageTokensPerLine.toLocaleString()}</Typography>
            </Box>
            <Box sx={{ pl: 2 }}>
              <Typography>
                Estimated Cost: {stats.estimatedPrice.toLocaleString("en", { currency: "USD", style: "currency" })}
              </Typography>
              <Typography>
                Estimated Time:{" "}
                {hasProgressInEmbeddings && completed > 0
                  ? timeRemaining
                  : humanReadableMinutes(stats.estimatedTimeMin)}
              </Typography>
              <Typography>
                Embeddings Created: {Math.max(stats.completedAlready || 0, completed).toLocaleString()}
              </Typography>
            </Box>
          </Box>
        )}
        <Box sx={{ mt: 1 }}>
          <Button
            sx={{ mr: 2 }}
            variant={"outlined"}
            disabled={hasProgressInEmbeddings}
            onClick={() => setModalOpen(false)}
          >
            Close
          </Button>
          <Button variant={"contained"} disabled={hasProgressInEmbeddings} onClick={onSubmit}>
            Submit
          </Button>
          {!stats && (
            <Button
              sx={{ ml: 2 }}
              variant={"outlined"}
              disabled={hasProgressInEmbeddings}
              onClick={() => setShowStats(true)}
            >
              Calculate Estimates
            </Button>
          )}
        </Box>
      </Box>
    </Backdrop>
  );
};
export const SemanticSearchInfo = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <Box sx={{ display: "flex", flexDirection: "row" }}>
      {modalOpen && <SemanticSearchModal modalOpen={modalOpen} setModalOpen={setModalOpen} />}
      <Button title={"Semantic Search"} onClick={() => setModalOpen(true)}>
        <AutoFixHighIcon />
      </Button>
    </Box>
  );
};
