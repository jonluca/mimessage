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
  useSemanticSearchStats,
} from "../../hooks/dataHooks";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

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
  if (minutes < 60) {
    return `${minutes.toLocaleString()} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour${hours === 1 ? "" : "s"} ${Math.round(remainingMinutes)} minute${
    remainingMinutes === 1 ? "" : "s"
  }`;
};
export const SemanticSearchInfo = () => {
  const { openAiKey, setOpenAiKey } = useMimessage((state) => state);
  const [modalOpen, setModalOpen] = useState(false);
  const [startTime, setStartTime] = useState<null | Dayjs>(null);
  const { mutateAsync, isLoading: isCreatingEmbeddings } = useCreateSemanticEmbeddings();
  const { data, isLoading } = useSemanticSearchStats(modalOpen);
  const { data: numCompleted } = useEmbeddingsCreationProgress();
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
  };

  const hasProgressInEmbeddings = Boolean(isCreatingEmbeddings && data);
  const completed = numCompleted || 0;

  const timeElapsed = startTime ? dayjs().diff(startTime, "seconds") / 60 : 0;
  const timeRemaining = data ? humanReadableMinutes((data.totalMessages - completed) * (timeElapsed / completed)) : "";
  return (
    <Box sx={{ display: "flex", flexDirection: "row" }}>
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
            below. Note: this will take a <i>long</i> time and might cost you a bit. The estimates are below.
          </Typography>
          <Typography variant="body1" sx={{ color: "white", fontWeight: "bold", mt: 2 }}>
            Important! Chroma must be running locally for this to work, on port 8000!
          </Typography>
          <a
            style={{ textDecoration: "underline", marginBottom: 8 }}
            href={"https://docs.trychroma.com/usage-guide#running-chroma-in-clientserver-mode"}
          >
            Learn more
          </a>

          {isLoading && <LinearProgress />}
          {hasProgressInEmbeddings && data ? (
            <Box>
              <LinearProgress variant="determinate" value={(completed / data.totalMessages) * 100} />
              <Box sx={{ my: 1, fontSize: 20 }}>
                {completed.toLocaleString()} completed / {data.totalMessages.toLocaleString()} total
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
          {data && (
            <Box sx={{ display: "flex", my: 2 }}>
              <Box>
                <Typography>Total Messages: {data.totalMessages.toLocaleString()}</Typography>
                <Typography>Total Tokens: {data.totalTokens.toLocaleString()}</Typography>
                <Typography>Avg Tokens / msg: {data.averageTokensPerLine.toLocaleString()}</Typography>
              </Box>
              <Box sx={{ pl: 2 }}>
                <Typography>
                  Estimated Cost: {data.estimatedPrice.toLocaleString("en", { currency: "USD", style: "currency" })}
                </Typography>
                <Typography>
                  Estimated Time:{" "}
                  {hasProgressInEmbeddings && completed > 0
                    ? timeRemaining
                    : humanReadableMinutes(data.estimatedTimeMin)}
                </Typography>
                <Typography>
                  Embeddings Created: {Math.max(data.completedAlready || 0, completed).toLocaleString()}
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
          </Box>
        </Box>
      </Backdrop>
      <Button title={"Semantic Search"} onClick={() => setModalOpen(true)}>
        <AutoFixHighIcon />
      </Button>
    </Box>
  );
};
