import { useMimessage } from "../../context";
import React from "react";
import { AttachmentView } from "./AttachmentView";
import { NativeModal } from "../NativeModal";
import { useHomeDir, useOpenFileAtLocation } from "../../hooks/dataHooks";
import { SystemSymbol } from "../SystemSymbol";

export const HighlightedMessage = () => {
  const highlightedMessage = useMimessage((state) => state.highlightedMessage);
  const setHighlightedMessage = useMimessage((state) => state.setHighlightedMessage);
  const { data: homedir } = useHomeDir();
  const openFileAtLocation = useOpenFileAtLocation();
  const handleClose = () => {
    setHighlightedMessage(null);
  };

  if (!highlightedMessage) {
    return null;
  }

  const title = highlightedMessage.transfer_name || "Attachment Preview";
  const originalPath = highlightedMessage.filename || "";
  const absolutePath = originalPath.startsWith("~/")
    ? homedir
      ? `${homedir}${originalPath.slice(1)}`
      : ""
    : originalPath;

  return (
    <NativeModal allowBackdropClose className="attachment-preview-backdrop" open onClose={handleClose}>
      <dialog open aria-labelledby="attachment-preview-title" aria-modal="true" className="attachment-preview-window">
        <header className="attachment-preview-toolbar">
          <button
            type="button"
            aria-label="Close attachment preview"
            autoFocus
            className="attachment-preview-close"
            title="Close"
            onClick={handleClose}
          >
            <SystemSymbol name="xmark" />
          </button>
          <h1 className="attachment-preview-title" id="attachment-preview-title" title={title}>
            {title}
          </h1>
          <button
            aria-label={`Reveal ${title} in Finder`}
            className="attachment-preview-reveal"
            disabled={!absolutePath}
            title="Reveal in Finder"
            type="button"
            onClick={() => {
              if (absolutePath) {
                void openFileAtLocation(absolutePath);
              }
            }}
          >
            <SystemSymbol name="folder-fill" />
          </button>
        </header>
        <div className="attachment-preview-content">
          <AttachmentView expanded message={highlightedMessage} />
        </div>
      </dialog>
    </NativeModal>
  );
};
