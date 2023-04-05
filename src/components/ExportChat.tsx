import { useMimessage } from "../context";
import React, { useState } from "react";
import Backdrop from "@mui/material/Backdrop";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Button, Checkbox, FormControlLabel, FormGroup } from "@mui/material";
import { useChatById } from "../hooks/dataHooks";

export const ExportChat = ({ onClose }: { onClose: () => void }) => {
  const chatId = useMimessage((state) => state.chatId);

  const chat = useChatById(chatId);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [fullExport, setFullExport] = useState(false);
  const [format, setFormat] = useState<"json" | "txt" | "csv">("json");
  const onExport = async () => {
    await ipcRenderer.invoke("export", { chat, fullExport, format, includeAttachments });
  };

  if (!chatId) {
    return null;
  }

  return (
    <Backdrop sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }} open onClick={onClose}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "auto",
          width: 600,
          m: 1,
          p: 1,
          background: "#2c2c2c",
          borderRadius: 2,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography variant={"h1"}>Export Chat</Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                style={{
                  color: "white",
                }}
                checked={includeAttachments}
                onChange={() => setIncludeAttachments((v) => !v)}
              />
            }
            label="Include attachments"
          />
          {format === "json" && (
            <FormControlLabel
              control={
                <Checkbox
                  style={{
                    color: "white",
                  }}
                  checked={fullExport}
                  onChange={() => setFullExport((v) => !v)}
                />
              }
              label="Full raw export (all message metadata)"
            />
          )}
          <FormControlLabel
            control={
              <select
                style={{ margin: "0 10px", cursor: "pointer", fontSize: 16 }}
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
              >
                <option value={"json"}>JSON</option>
                <option value={"txt"}>TXT</option>
                <option value={"csv"}>CSV</option>
              </select>
            }
            label="Output Format"
          />
        </FormGroup>
        <Button onClick={onExport}>Export</Button>
      </Box>
    </Backdrop>
  );
};
