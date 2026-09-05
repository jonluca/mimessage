import React from "react";
import { SystemSymbol } from "../SystemSymbol";

export type ConversationListFilter = "all" | "deleted" | "spam" | "unknown" | "unread";

interface ConversationFilterButtonProps {
  hasUnread?: boolean;
  value: ConversationListFilter;
  onChange: (value: ConversationListFilter) => void;
}

const FilterIcon = () => <SystemSymbol name="filter" />;

export const ConversationFilterButton = ({ hasUnread = false, value, onChange }: ConversationFilterButtonProps) => {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const openMenu = async () => {
    if (menuOpen) {
      return;
    }
    setMenuOpen(true);
    try {
      const selection = (await global.ipcRenderer.invoke("showConversationFilterMenu", value)) as
        | ConversationListFilter
        | "manage"
        | null;
      if (selection === "manage") {
        await global.ipcRenderer.invoke("showSettings");
      } else if (selection) {
        onChange(selection);
      }
    } finally {
      setMenuOpen(false);
    }
  };

  return (
    <button
      type="button"
      className={`toolbar-icon-button messages-filter-button${value === "all" ? "" : " is-filtered"}`}
      aria-label="Filter conversations"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      title="Filter conversations"
      onClick={() => void openMenu()}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          void openMenu();
        }
      }}
    >
      <FilterIcon />
      {hasUnread ? <span className="messages-filter-unread-badge" aria-hidden="true" /> : null}
    </button>
  );
};
