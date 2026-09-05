import React from "react";
import { useMimessage } from "../../context";
import { SystemSymbol } from "../SystemSymbol";

export const ComposeButton = () => {
  const startNewMessage = () => {
    useMimessage.setState({
      chatId: null,
      filter: null,
      globalSearch: null,
      isComposingNewMessage: true,
      messageIdToBringToFocus: null,
      search: null,
      selectedSearchMessageId: null,
    });
  };

  return (
    <button
      aria-label="New Message"
      className="toolbar-icon-button messages-compose-button"
      title="New Message"
      type="button"
      onClick={startNewMessage}
    >
      <SystemSymbol name="compose" />
    </button>
  );
};
