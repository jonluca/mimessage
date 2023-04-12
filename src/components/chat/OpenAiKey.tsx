import React, { useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import { Button, CircularProgress } from "@mui/material";
import Backdrop from "@mui/material/Backdrop";
import Typography from "@mui/material/Typography";
import { toast } from "react-toastify";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { useCreateSemanticEmbeddings, useSemanticSearchStats } from "../../hooks/dataHooks";

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
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hours ${Math.round(remainingMinutes)} minutes`;
};
export const SemanticSearchInfo = () => {
  const { setOpenAiKey, setPineconeNamespace, setPineconeApiKey, setPineconeBaseUrl } = useMimessage((state) => state);
  const [modalOpen, setModalOpen] = useState(false);
  const { mutateAsync, isLoading: isCreatingEmbeddings } = useCreateSemanticEmbeddings();
  const { data, isLoading } = useSemanticSearchStats(modalOpen);
  const ref = useRef<HTMLInputElement>(null);
  const pineconeApiRef = useRef<HTMLInputElement>(null);
  const pineconeNamespaceRef = useRef<HTMLInputElement>(null);
  const pineconeBaseUrlRef = useRef<HTMLInputElement>(null);
  const onSubmit = async () => {
    if (isCreatingEmbeddings) {
      return;
    }
    const key = ref.current?.value;
    const pineconeApiKey = pineconeApiRef.current?.value;
    const pineconeNamespace = pineconeNamespaceRef.current?.value;
    const pineconeBaseUrl = pineconeBaseUrlRef.current?.value;
    if (!key || !pineconeApiKey || !pineconeNamespace || !pineconeBaseUrl) {
      toast("Please enter all API information", { type: "error" });
      return;
    }
    if (!key.startsWith("sk-") || key.length !== 51) {
      toast("Invalid OpenAI API key - must start with sk- and be 51 chars long", { type: "error" });
      return;
    }
    setPineconeApiKey(pineconeApiKey);
    setPineconeNamespace(pineconeNamespace);
    setPineconeBaseUrl(pineconeBaseUrl);
    setOpenAiKey(key ?? null);

    await mutateAsync({
      openAiKey: key,
      pineconeApiKey,
      pineconeNamespace,
      pineconeBaseUrl,
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "row" }}>
      <Backdrop onClick={() => setModalOpen(false)} open={modalOpen}>
        <Box
          onClick={(e) => e.stopPropagation()}
          sx={{ background: "#2c2c2c", maxWidth: 600, p: 1, m: 1 }}
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
          <input
            ref={ref}
            placeholder={"Enter your OpenAI API key"}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSubmit()}
          />
          <input
            ref={pineconeApiRef}
            placeholder={"Enter your Pinecone API key"}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSubmit()}
          />
          <input
            ref={pineconeNamespaceRef}
            placeholder={"Enter your Pinecone Namespace"}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSubmit()}
          />
          <input
            ref={pineconeBaseUrlRef}
            placeholder={"Enter your Pinecone Base URL"}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && onSubmit()}
          />
          {(isLoading || isCreatingEmbeddings) && <CircularProgress />}
          {data && (
            <>
              <Typography>Total Messages: {data.totalMessages.toLocaleString()}</Typography>
              <Typography>Total Tokens: {data.totalTokens.toLocaleString()}</Typography>
              <Typography>Avg Tokens / msg: {data.averageTokensPerLine.toLocaleString()}</Typography>
              <Typography>
                Estimated Cost: {data.estimatedPrice.toLocaleString("en", { currency: "USD", style: "currency" })}
              </Typography>
              <Typography>Estimated Time: {humanReadableMinutes(data.estimatedTimeMin)}</Typography>
            </>
          )}
          <Button onClick={onSubmit}>Close and submit</Button>
        </Box>
      </Backdrop>
      <Button title={"Semantic Search"} onClick={() => setModalOpen(true)}>
        <AutoFixHighIcon />
      </Button>
    </Box>
  );
};
