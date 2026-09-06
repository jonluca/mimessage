import { useMimessage } from "../../context";
import React, { useState } from "react";
import { useChatMap } from "../../hooks/dataHooks";
import { NativeModal } from "../NativeModal";
import { getConversationForExport } from "../../utils/conversation-export";

export const ExportChat = ({ onClose }: { onClose: () => void }) => {
  const chatId = useMimessage((state) => state.chatId);

  const chats = useChatMap();
  const chat = chatId === null ? undefined : chats.get(chatId);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [fullExport, setFullExport] = useState(false);
  const [format, setFormat] = useState<"json" | "txt" | "csv">("json");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const onExport = async () => {
    if (isExporting || !chat) {
      return;
    }
    setExportError(null);
    setIsExporting(true);
    try {
      const didExport = (await ipcRenderer.invoke("export", {
        chat: getConversationForExport(chat, chats),
        fullExport,
        format,
        includeAttachments,
      })) as boolean;
      if (didExport) {
        onClose();
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The conversation couldn’t be exported.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!chatId) {
    return null;
  }

  return (
    <NativeModal className="export-backdrop" open onClose={isExporting ? undefined : onClose}>
      <dialog
        open
        className="messages-modal messages-sheet export-modal"
        aria-modal="true"
        aria-labelledby="export-title"
        aria-describedby="export-description"
      >
        <header className="messages-modal-header export-header">
          <h2 id="export-title" className="messages-modal-title export-title">
            Export Conversation
          </h2>
          <p id="export-description" className="messages-modal-subtitle export-subtitle">
            Save a copy of this conversation on your Mac.
          </p>
        </header>

        <fieldset className="messages-modal-content export-options">
          <legend className="visually-hidden">Export options</legend>
          <div className="export-format export-form-row">
            <label id="export-format-label" htmlFor="export-format-select">
              Format:
            </label>
            <select
              id="export-format-select"
              className="export-format-select"
              value={format}
              disabled={isExporting}
              onChange={(event) => setFormat(event.currentTarget.value as "json" | "txt" | "csv")}
            >
              <option value="json">JSON</option>
              <option value="txt">Plain Text</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <label className="export-option export-form-row">
            <span className="export-form-label">Options:</span>
            <input
              className="export-checkbox"
              type="checkbox"
              checked={includeAttachments}
              disabled={isExporting}
              onChange={(event) => setIncludeAttachments(event.currentTarget.checked)}
            />
            <span className="export-option-copy">
              <span>Include attachments</span>
              <small>Copies photos, videos, and other files into the export.</small>
            </span>
          </label>
          {format === "json" && (
            <label className="export-option export-option--indented">
              <input
                className="export-checkbox"
                type="checkbox"
                checked={fullExport}
                disabled={isExporting}
                onChange={(event) => setFullExport(event.currentTarget.checked)}
              />
              <span className="export-option-copy">
                <span>Include all message metadata</span>
                <small>Adds the full underlying Messages record to the JSON file.</small>
              </span>
            </label>
          )}
          {exportError && (
            <p className="messages-inline-error export-error" role="alert">
              {exportError}
            </p>
          )}
        </fieldset>

        <footer className="messages-modal-actions export-actions">
          <button
            type="button"
            className="messages-modal-button export-cancel-button"
            disabled={isExporting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="messages-modal-button messages-modal-button--primary export-primary-button"
            disabled={isExporting}
            onClick={() => void onExport()}
          >
            {isExporting ? "Exporting…" : "Export"}
          </button>
        </footer>
      </dialog>
    </NativeModal>
  );
};
