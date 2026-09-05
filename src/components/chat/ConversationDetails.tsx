import React from "react";
import type { Contact } from "electron-mac-contacts";
import type { Chat } from "../../interfaces";
import { MessageAvatar } from "../message/Avatar";
import { SystemSymbol, type SystemSymbolName } from "../SystemSymbol";

export type ConversationDetailsAction = "export" | "first" | "latest" | "search" | "timestamps";

interface ConversationDetailsProps {
  chat: Chat | undefined;
  onAction: (action: ConversationDetailsAction) => void;
  onClose: () => void;
  showTimes: boolean;
}

const ACTIONS = [
  { icon: "phone-fill", label: "Call" },
  { icon: "video-fill", label: "FaceTime" },
  { icon: "envelope-fill", label: "Mail" },
  { icon: "rectangle-stack-fill", label: "Screen Sharing" },
] as const;

const TABS = ["Info", "Backgrounds", "Photos", "Links"] as const;

const ActionIcon = ({ icon }: { icon: SystemSymbolName }) => <SystemSymbol name={icon} />;

const CloseIcon = () => <SystemSymbol name="xmark" />;

export const ConversationDetails = ({ chat, onAction, onClose, showTimes }: ConversationDetailsProps) => {
  const [activeTab, setActiveTab] = React.useState<(typeof TABS)[number]>("Info");
  const handles = chat?.handles || [];
  const contact = handles.length === 1 ? handles[0]?.contact : null;
  const identifier = handles.length === 1 ? handles[0]?.id : `${handles.length} people`;
  const phone = contact?.phoneNumbers?.[0] || (identifier && !identifier.includes("@") ? identifier : null);
  const email = contact?.emailAddresses?.[0] || (identifier?.includes("@") ? identifier : null);
  const postalAddress = (contact as (Contact & { postalAddresses?: string[] }) | null | undefined)?.postalAddresses
    ?.find((address) => address.trim())
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ");

  const openEditMenu = async () => {
    const action = (await global.ipcRenderer.invoke(
      "showConversationDetailsEditMenu",
      showTimes,
    )) as ConversationDetailsAction | null;
    if (action) {
      onAction(action);
    }
  };

  return (
    <aside className="conversation-details" aria-label="Conversation details">
      <header className="conversation-details-toolbar draggable">
        <button type="button" className="conversation-details-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
        <button type="button" className="conversation-details-edit" onClick={() => void openEditMenu()}>
          Edit
        </button>
      </header>

      <div className="conversation-details-profile">
        <MessageAvatar contact={contact} fallback={chat?.name || "?"} size={58} />
        <h2>{chat?.name || "Unknown"}</h2>
      </div>

      <div className="conversation-details-actions" aria-label="Contact actions">
        {ACTIONS.map((action) => (
          <button
            type="button"
            key={action.label}
            className="conversation-details-action"
            aria-label={action.label}
            disabled
            title="Unavailable in Mimessage"
          >
            <span aria-hidden="true">
              <ActionIcon icon={action.icon} />
            </span>
          </button>
        ))}
      </div>

      <nav className="conversation-details-tabs" aria-label="Conversation details sections">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab}
            aria-current={activeTab === tab ? "page" : undefined}
            disabled={tab !== "Info"}
            title={tab === "Info" ? undefined : "Unavailable in Mimessage"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Info" ? (
        <div className="conversation-details-scroll">
          <section className="conversation-details-map" aria-label="Location">
            <span className="conversation-details-map-marker">
              <MessageAvatar contact={contact} fallback={chat?.name || "?"} size={38} />
            </span>
            <span className="conversation-details-map-copy">
              <strong>Location Unavailable</strong>
              <small>View in Messages</small>
            </span>
          </section>

          <section className="conversation-details-group conversation-details-location-actions">
            <button disabled title="Manage in Messages" type="button">
              Hide My Location
            </button>
            <button disabled title="Manage in Messages" type="button">
              Stop Sharing My Location
            </button>
          </section>

          {phone ? (
            <section className="conversation-details-group conversation-details-contact-value">
              <span>
                <span className="conversation-details-contact-copy">
                  <small>phone</small>
                  <strong>{phone}</strong>
                </span>
                <span className="conversation-details-contact-icon" aria-hidden="true">
                  <ActionIcon icon="phone-fill" />
                </span>
              </span>
            </section>
          ) : null}

          {email && email !== phone ? (
            <section className="conversation-details-group conversation-details-contact-value">
              <span>
                <span className="conversation-details-contact-copy">
                  <small>email</small>
                  <strong>{email}</strong>
                </span>
                <span className="conversation-details-contact-icon" aria-hidden="true">
                  <ActionIcon icon="envelope-fill" />
                </span>
              </span>
            </section>
          ) : null}

          {postalAddress ? (
            <section className="conversation-details-group conversation-details-contact-value">
              <span>
                <span className="conversation-details-contact-copy">
                  <small>home</small>
                  <strong>{postalAddress}</strong>
                </span>
                <span className="conversation-details-contact-icon" aria-hidden="true">
                  <ActionIcon icon="location-fill" />
                </span>
              </span>
            </section>
          ) : null}

          <section className="conversation-details-group conversation-details-switches">
            <label title="Manage in Messages">
              <span>Hide Alerts</span>
              <input disabled type="checkbox" />
            </label>
            <label title="Manage in Messages">
              <span>Send Read Receipts</span>
              <input disabled type="checkbox" />
            </label>
            <label title="Manage in Messages">
              <span>Show in Shared with You</span>
              <input disabled type="checkbox" />
            </label>
            <label title="Manage in Messages">
              <span>Share Focus Status</span>
              <input disabled type="checkbox" />
            </label>
          </section>

          <section className="conversation-details-group conversation-details-translate">
            <button disabled title="Manage in Messages" type="button">
              <span>Automatically Translate</span>
              <span className="conversation-details-disclosure">
                Unavailable
                <SystemSymbol name="chevron-up-down" />
              </span>
            </button>
          </section>

          <section className="conversation-details-group conversation-details-links">
            <button disabled title="Unavailable in Mimessage" type="button">
              Show in Contacts
            </button>
          </section>

          <section className="conversation-details-group conversation-details-links">
            <button disabled title="Manage in Messages" type="button" className="is-destructive">
              Block Contact
            </button>
          </section>

          <section className="conversation-details-group conversation-details-links">
            <button disabled title="Manage in Messages" type="button">
              Download Attachments in iCloud
            </button>
          </section>

          <section className="conversation-details-group conversation-details-links">
            <button disabled title="Manage in Messages" type="button">
              Turn On Contact Key Verification
            </button>
          </section>

          <p className="conversation-details-privacy">
            All iMessage conversations are securely encrypted end-to-end, so they can&apos;t be read while they&apos;re
            sent between devices. <span>Learn More…</span>
          </p>
        </div>
      ) : (
        <div className="conversation-details-empty">No {activeTab}</div>
      )}
    </aside>
  );
};
