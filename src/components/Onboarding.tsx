import React, { useState } from "react";
import {
  useContacts,
  useCopyDbMutation,
  useDoesLocalDbExist,
  useHasAllowedPermissions,
  useRequestAccessMutation,
  useSkipContactsCheck,
} from "../hooks/dataHooks";
import { NativeModal } from "./NativeModal";
import { SystemSymbol } from "./SystemSymbol";

const PermissionsDialog = ({ denied, allowed, copy }: { denied: boolean; allowed: boolean; copy: string }) => {
  const status = denied ? "denied" : allowed ? "allowed" : "pending";
  const statusCopy = denied ? "Not allowed" : allowed ? "Allowed" : "Waiting for access";

  return (
    <div className={`setup-permission-row setup-permission-row--${status}`} role="status" aria-live="polite">
      <span className="setup-permission-icon" aria-hidden="true">
        {denied ? (
          <SystemSymbol name="xmark-circle-fill" />
        ) : allowed ? (
          <SystemSymbol name="checkmark-circle-fill" />
        ) : (
          <span className="native-spinner native-spinner--small" aria-label="Waiting for permission" />
        )}
      </span>
      <span className="setup-permission-copy">
        <span className="setup-permission-label">{copy}</span>
        <span className="setup-permission-status">{statusCopy}</span>
      </span>
    </div>
  );
};
export const Onboarding = () => {
  const { isLoading, refetch } = useDoesLocalDbExist();
  const { data: permissions, isLoading: isLoadingPerms, refetch: refetchPerms } = useHasAllowedPermissions();
  const hasDiskAccess = permissions?.diskAccessStatus === "authorized";
  const hasContactsAccess = permissions?.contactsStatus === "authorized";
  const { isLoading: contactsLoading } = useContacts(hasContactsAccess);
  const { mutateAsync: copyDb, isPending: isCopying } = useCopyDbMutation();
  const { mutateAsync: skipContactsCheck } = useSkipContactsCheck();
  const { mutateAsync: requestPerms, isPending: isRequestingPerms } = useRequestAccessMutation();
  const [skipContacts, setSkipContacts] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  React.useEffect(() => {
    void global.ipcRenderer.invoke("setSetupWindowMode", true);
    return () => {
      void global.ipcRenderer.invoke("setSetupWindowMode", false);
    };
  }, []);
  const diskIsDenied = permissions?.diskAccessStatus === "denied" || permissions?.diskAccessStatus === "restricted";
  const contactsIsDenied = permissions?.contactsStatus === "denied" || permissions?.contactsStatus === "restricted";
  const permissionIsDenied = diskIsDenied || contactsIsDenied;
  const diskStatusMessage =
    permissions?.diskAccessStatus === "not determined"
      ? "Open Messages once, then try again."
      : permissions?.diskAccessStatus === "unknown"
        ? "Mimessage could not check Messages access."
        : null;

  const isPastPermissions = hasDiskAccess && (hasContactsAccess || skipContacts);
  const onCopy = async () => {
    setActionError(null);
    try {
      if (isPastPermissions) {
        await copyDb();
        await refetch();
      } else {
        await requestPerms();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Mimessage couldn’t complete setup.");
    }
  };

  const showSpinner = contactsLoading || isCopying || isLoading || isRequestingPerms || isLoadingPerms;
  return (
    <NativeModal className="setup-backdrop" open>
      <dialog
        open
        className="messages-modal messages-assistant setup-modal"
        aria-modal="true"
        aria-labelledby="setup-title"
        aria-describedby="setup-description"
        aria-busy={showSpinner}
      >
        <header className="messages-modal-header setup-header">
          <span className="setup-app-icon" aria-hidden="true" />
          <div className="setup-heading">
            <h1 id="setup-title" className="messages-modal-title setup-title">
              {isPastPermissions ? "Import Messages" : "Mimessage Setup Assistant"}
            </h1>
            <p id="setup-description" className="messages-modal-subtitle setup-subtitle">
              {isPastPermissions
                ? "Create the local message index used by Mimessage."
                : "Mimessage needs permission to read your Messages library and show contact names."}
            </p>
          </div>
        </header>

        <div className="messages-modal-content setup-content">
          {isPastPermissions ? (
            <section className="setup-import-card" aria-labelledby="setup-import-heading">
              <h2 id="setup-import-heading">Message Library</h2>
              <p className="setup-copy">
                Importing usually takes a few seconds. A large message history can take up to two minutes.
              </p>
              <div className="setup-group setup-privacy">
                <span className="setup-privacy-icon">
                  <SystemSymbol name="lock-fill" />
                </span>
                <span>
                  <strong>Stored on this Mac</strong>
                  <small>
                    Messages are processed on this Mac. Content is only sent to OpenAI when you explicitly use an AI
                    feature.
                  </small>
                </span>
              </div>
            </section>
          ) : (
            <section className="setup-permission-section" aria-labelledby="setup-permission-heading">
              <h2 id="setup-permission-heading">Required Access</h2>
              <div className="setup-group setup-permissions" aria-label="Required permissions">
                <PermissionsDialog denied={contactsIsDenied} allowed={hasContactsAccess} copy="Contacts" />
                <PermissionsDialog denied={diskIsDenied} allowed={hasDiskAccess} copy="Full Disk Access" />
              </div>
              {diskStatusMessage && (
                <p className="setup-permission-help" role="status">
                  {diskStatusMessage}
                </p>
              )}
              <p className="setup-access-note">macOS will ask you to confirm each permission in System Settings.</p>
            </section>
          )}
          {actionError && (
            <p className="messages-inline-error setup-action-error" role="alert">
              {actionError}
            </p>
          )}
        </div>

        <footer className="messages-modal-actions setup-actions">
          <span className="setup-step-copy">Step {isPastPermissions ? "2" : "1"} of 2</span>
          {hasDiskAccess && !hasContactsAccess && !isPastPermissions && (
            <button
              className="messages-modal-button setup-skip-button"
              type="button"
              onClick={async () => {
                setActionError(null);
                try {
                  await skipContactsCheck();
                  setSkipContacts(true);
                  await refetchPerms();
                } catch (error) {
                  setActionError(error instanceof Error ? error.message : "Mimessage couldn’t update contact access.");
                }
              }}
            >
              Continue Without Contacts
            </button>
          )}
          <button
            className="messages-modal-button messages-modal-button--primary setup-primary-button"
            disabled={showSpinner}
            type="button"
            onClick={onCopy}
          >
            {showSpinner ? (
              <span className="native-spinner native-spinner--button" aria-label="Working" />
            ) : isPastPermissions ? (
              "Import Messages"
            ) : permissionIsDenied ? (
              "Open System Settings…"
            ) : (
              "Allow Access"
            )}
          </button>
        </footer>
      </dialog>
    </NativeModal>
  );
};
