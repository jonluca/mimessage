import React from "react";
import { useMimessage } from "../../context";
import { useChatById } from "../../hooks/dataHooks";
import { MessageAvatar } from "../message/Avatar";
import { Filter } from "../chat-list/SearchBox";
import { SystemSymbol } from "../SystemSymbol";
import type { Contact } from "electron-mac-contacts";
import { ComposeButton } from "./ComposeButton";

const VideoIcon = () => <SystemSymbol name="video" />;

const TinyChevronIcon = () => <SystemSymbol className="thread-toolbar-chevron" name="chevron-down" />;

const getContactLocality = (contact: Contact | null | undefined) => {
  const postalAddresses = (contact as (Contact & { postalAddresses?: string[] }) | null | undefined)?.postalAddresses;
  const address = postalAddresses?.find((candidate) => candidate.trim());
  if (!address) {
    return null;
  }
  const lines = address
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const localityLine = lines.find((line) => /,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/u.test(line));
  return localityLine?.replace(/\s+\d{5}(?:-\d{4})?$/u, "") || null;
};

export const SelectedChatFilterBar = ({
  detailsOpen,
  onToggleDetails,
  searchOpen,
}: {
  detailsOpen: boolean;
  onToggleDetails: () => void;
  searchOpen: boolean;
}) => {
  const chatId = useMimessage((state) => state.chatId);
  const chat = useChatById(chatId);
  const handles = chat?.handles || [];
  const isSingleConversation = handles.length === 1;
  const contact = isSingleConversation ? handles[0]?.contact : null;
  const subtitle = isSingleConversation
    ? getContactLocality(contact) || contact?.organizationName || "iMessage"
    : `${handles.length} people`;

  return (
    <header className="thread-header draggable">
      <div className="thread-header-main" aria-label="Conversation toolbar">
        <div className="thread-header-left">
          <ComposeButton />
        </div>

        <button
          type="button"
          className="thread-contact"
          title={detailsOpen ? "Hide conversation details" : "Show conversation details"}
          aria-expanded={detailsOpen}
          onClick={onToggleDetails}
        >
          <div className="thread-contact-capsule">
            <span className="thread-contact-avatar">
              <MessageAvatar contact={contact} fallback={chat?.name || "?"} size={44} />
            </span>
            <span className="thread-contact-copy">
              <span className="thread-contact-name">{chat?.name || "Unknown"}</span>
              <span className="thread-contact-subtitle">{subtitle}</span>
            </span>
            <TinyChevronIcon />
          </div>
        </button>

        <div className="thread-header-actions">
          <button
            type="button"
            className="thread-toolbar-button thread-facetime-control"
            aria-label="Start FaceTime"
            disabled
            title="Unavailable in Mimessage"
          >
            <VideoIcon />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="thread-inline-search">
          <Filter />
        </div>
      )}
    </header>
  );
};
