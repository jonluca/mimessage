import React, { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMimessage } from "../context";
import { useHasAllowedPermissions } from "../hooks/dataHooks";
import { broadcastPreferences } from "../utils/preferences";
import { SemanticSearchInfo } from "./chat/OpenAiKey";
import { SystemSymbol } from "./SystemSymbol";

type SettingsPane = "general" | "privacy";

const SETTINGS_WIDTH = 600;
const SETTINGS_HEIGHT: Record<SettingsPane, number> = {
  general: 699,
  privacy: 618,
};

const RELATION_OPTIONS = [
  "Friend",
  "Girlfriend",
  "Boyfriend",
  "Husband",
  "Wife",
  "Mother",
  "Father",
  "Brother",
  "Sister",
  "Grandmother",
  "Grandfather",
];

const permissionLabel = (status: string | undefined) => {
  if (status === "authorized") {
    return "Allowed";
  }
  if (status === "denied" || status === "restricted") {
    return "Not Allowed";
  }
  return "Not Set";
};

const permissionClass = (status: string | undefined) => (status || "unknown").replaceAll(" ", "-");

const openPrivacySettings = (pane: "contacts" | "full-disk") => {
  void global.ipcRenderer.invoke("openPrivacySettings", pane);
};

export const Settings = () => {
  const {
    aiPersonaInstructions,
    openAiKey,
    relation,
    setAiPersonaInstructions,
    setOpenAiKey,
    setRelation,
    setUseSemanticSearch,
    useSemanticSearch,
  } = useMimessage(
    useShallow((state) => ({
      aiPersonaInstructions: state.aiPersonaInstructions,
      openAiKey: state.openAiKey,
      relation: state.relation,
      setAiPersonaInstructions: state.setAiPersonaInstructions,
      setOpenAiKey: state.setOpenAiKey,
      setRelation: state.setRelation,
      setUseSemanticSearch: state.setUseSemanticSearch,
      useSemanticSearch: state.useSemanticSearch,
    })),
  );
  const { data: permissions } = useHasAllowedPermissions();
  const [keyDraft, setKeyDraft] = useState("");
  const [activePane, setActivePane] = useState<SettingsPane>("general");

  useEffect(() => {
    setKeyDraft(openAiKey || "");
  }, [openAiKey]);

  useEffect(() => {
    document.title = activePane === "general" ? "General" : "Privacy";
    window.resizeTo(SETTINGS_WIDTH, SETTINGS_HEIGHT[activePane]);
  }, [activePane]);

  const updateKey = (draft: string) => {
    const nextKey = draft.trim();
    setKeyDraft(draft);
    setOpenAiKey(nextKey || null);
    if (nextKey) {
      broadcastPreferences({ openAiKey: nextKey });
    } else {
      setUseSemanticSearch(false);
      broadcastPreferences({ openAiKey: null, useSemanticSearch: false });
    }
  };

  const saveKeyDraft = () => updateKey(keyDraft);

  return (
    <dialog
      open
      aria-describedby={activePane === "general" ? "settings-description" : "settings-privacy-description"}
      aria-labelledby="settings-title"
      className="settings-window settings-window--standalone"
    >
      <header className="settings-titlebar draggable">
        <span className="settings-titlebar-balance" aria-hidden="true" />
        <h1 className="settings-title" id="settings-title">
          {activePane === "general" ? "General" : "Privacy"}
        </h1>
        <span className="settings-titlebar-balance" aria-hidden="true" />
      </header>

      <nav className="settings-toolbar" aria-label="Settings sections" role="tablist">
        <button
          aria-controls="settings-general-panel"
          aria-selected={activePane === "general"}
          className={`settings-toolbar-item${activePane === "general" ? " is-selected" : ""}`}
          id="settings-general-tab"
          role="tab"
          type="button"
          onClick={() => setActivePane("general")}
        >
          <span className="settings-toolbar-icon settings-toolbar-icon--general">
            <SystemSymbol name="gearshape" />
          </span>
          <span>General</span>
        </button>
        <button
          aria-controls="settings-privacy-panel"
          aria-selected={activePane === "privacy"}
          className={`settings-toolbar-item${activePane === "privacy" ? " is-selected" : ""}`}
          id="settings-privacy-tab"
          role="tab"
          type="button"
          onClick={() => setActivePane("privacy")}
        >
          <span className="settings-toolbar-icon settings-toolbar-icon--privacy">
            <SystemSymbol name="lock-fill" />
          </span>
          <span>Privacy</span>
        </button>
      </nav>

      <div className="settings-scroll">
        {activePane === "general" ? (
          <section
            aria-labelledby="settings-general-tab"
            className="settings-pane settings-pane--general"
            id="settings-general-panel"
            role="tabpanel"
          >
            <p className="visually-hidden" id="settings-description">
              Configure optional AI Messages features and reply preferences.
            </p>
            <div className="settings-form">
              <label className="settings-form-row" htmlFor="settings-openai-key">
                <span className="settings-form-label">OpenAI API key:</span>
                <span className="settings-form-control">
                  <input
                    autoComplete="off"
                    className="settings-text-field"
                    id="settings-openai-key"
                    placeholder="Not Set"
                    type="password"
                    value={keyDraft}
                    onChange={(event) => {
                      updateKey(event.currentTarget.value);
                    }}
                    onBlur={saveKeyDraft}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        saveKeyDraft();
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <small>Stored securely on this Mac.</small>
                </span>
              </label>
              <div className="settings-form-row">
                <span className="settings-form-label">Search:</span>
                <span className="settings-form-control">
                  <span className="settings-form-control--inline">
                    <label className="settings-checkbox-line" htmlFor="settings-semantic-search">
                      <input
                        checked={useSemanticSearch}
                        className="settings-checkbox"
                        disabled={!keyDraft.trim()}
                        id="settings-semantic-search"
                        type="checkbox"
                        onChange={(event) => {
                          setUseSemanticSearch(event.target.checked);
                          broadcastPreferences({ useSemanticSearch: event.target.checked });
                        }}
                      />
                      <span>Search messages by meaning</span>
                    </label>
                    {keyDraft.trim() ? <SemanticSearchInfo label="Set Up…" /> : null}
                  </span>
                  {!keyDraft.trim() ? <small>Add an API key to enable semantic search.</small> : null}
                </span>
              </div>
              <div className="settings-form-divider" aria-hidden="true" />
              <label className="settings-form-row" htmlFor="settings-relationship">
                <span className="settings-form-label">Relationship:</span>
                <span className="settings-form-control">
                  <select
                    className="settings-select"
                    id="settings-relationship"
                    value={relation}
                    onChange={(event) => {
                      setRelation(event.currentTarget.value);
                      broadcastPreferences({ relation: event.currentTarget.value });
                    }}
                  >
                    {RELATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <small>Used to shape optional AI replies.</small>
                </span>
              </label>
              <label className="settings-form-row settings-form-row--top" htmlFor="settings-ai-instructions">
                <span className="settings-form-label">Reply style:</span>
                <span className="settings-form-control">
                  <textarea
                    className="settings-textarea"
                    id="settings-ai-instructions"
                    maxLength={2_000}
                    placeholder="Add custom instructions…"
                    value={aiPersonaInstructions}
                    onChange={(event) => {
                      setAiPersonaInstructions(event.currentTarget.value);
                      broadcastPreferences({ aiPersonaInstructions: event.currentTarget.value });
                    }}
                  />
                  <small>Optional guidance for generated replies.</small>
                </span>
              </label>
              <div className="settings-form-row settings-remove-key-row">
                <span aria-hidden="true" />
                <button
                  className="settings-row-button settings-remove-key"
                  disabled={!keyDraft}
                  type="button"
                  onClick={() => {
                    updateKey("");
                  }}
                >
                  Remove API Key
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section
            aria-labelledby="settings-privacy-tab"
            className="settings-pane settings-pane--privacy"
            id="settings-privacy-panel"
            role="tabpanel"
          >
            <p className="settings-pane-intro" id="settings-privacy-description">
              Mimessage reads your Messages history directly from this Mac. Access can be changed at any time in System
              Settings.
            </p>
            <div className="settings-access-list" aria-live="polite">
              <div className="settings-access-row">
                <span className="settings-row-copy">
                  <strong>Contacts</strong>
                  <small>Shows names and contact photos</small>
                </span>
                <span className={`settings-status settings-status--${permissionClass(permissions?.contactsStatus)}`}>
                  {permissionLabel(permissions?.contactsStatus)}
                </span>
                <button className="settings-row-button" type="button" onClick={() => openPrivacySettings("contacts")}>
                  Open System Settings…
                </button>
              </div>
              <div className="settings-access-row">
                <span className="settings-row-copy">
                  <strong>Messages Library</strong>
                  <small>Reads the local Messages database</small>
                </span>
                <span className={`settings-status settings-status--${permissionClass(permissions?.diskAccessStatus)}`}>
                  {permissionLabel(permissions?.diskAccessStatus)}
                </span>
                <button className="settings-row-button" type="button" onClick={() => openPrivacySettings("full-disk")}>
                  Open System Settings…
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </dialog>
  );
};
