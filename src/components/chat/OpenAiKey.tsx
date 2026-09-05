import type { Dispatch, SetStateAction } from "react";
import React, { useRef, useState } from "react";
import { useMimessage } from "../../context";
import {
  type EmbeddingsCreationProgress,
  useCreateSemanticEmbeddings,
  useEmbeddingsCreationProgress,
  useMessageCount,
  useSemanticSearchStats,
} from "../../hooks/dataHooks";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import prettyMilliseconds from "pretty-ms";
import { useShallow } from "zustand/react/shallow";
import { NativeModal } from "../NativeModal";
import { broadcastPreferences } from "../../utils/preferences";
import { SystemSymbol } from "../SystemSymbol";

const PlusIcon = () => <SystemSymbol name="plus" />;

const AudioWaveIcon = () => <SystemSymbol name="waveform" />;

const EmojiIcon = () => <SystemSymbol name="face-smiling" />;

const SparklesIcon = () => <SystemSymbol name="sparkles" />;

export const OpenAiKey = () => {
  return (
    <div className="composer-key-setup">
      <span className="composer-add-button composer-key-add-button" aria-hidden="true">
        <PlusIcon />
      </span>
      <div
        aria-disabled="true"
        aria-label="iMessage. Add an OpenAI API key in Settings to enable AI Messages."
        className="composer-key-button"
        role="textbox"
      >
        <span className="composer-key-placeholder">iMessage</span>
        <span className="message-composer-audio-icon" aria-hidden="true">
          <AudioWaveIcon />
        </span>
      </div>
      <span className="message-composer-emoji-icon composer-key-emoji-button" aria-hidden="true">
        <EmojiIcon />
      </span>
    </div>
  );
};

const humanReadableMinutes = (minutes: number) => {
  if (isNaN(minutes) || minutes === 0 || minutes === Infinity) {
    return "Unknown";
  }

  return prettyMilliseconds(minutes * 60 * 1000, { verbose: true, secondsDecimalDigits: 0 });
};

const SemanticSearchModal = ({
  modalOpen,
  setModalOpen,
}: {
  modalOpen: boolean;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const { openAiKey, setOpenAiKey } = useMimessage(
    useShallow((state) => ({ openAiKey: state.openAiKey, setOpenAiKey: state.setOpenAiKey })),
  );
  const [showStats, setShowStats] = useState(false);
  const [startTime, setStartTime] = useState<null | Dayjs>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const { mutateAsync, isPending: isCreatingEmbeddings } = useCreateSemanticEmbeddings();
  const { data: stats, isFetching } = useSemanticSearchStats(modalOpen && showStats);
  const { data: rawProgress } = useEmbeddingsCreationProgress(modalOpen);

  const { data: count } = useMessageCount();
  const ref = useRef<HTMLInputElement>(null);
  const onSubmit = async () => {
    if (isCreatingEmbeddings) {
      return;
    }
    const key = ref.current?.value.trim();
    if (!key) {
      setInlineError("Enter an OpenAI API key to create the index.");
      return;
    }
    setInlineError(null);
    setOpenAiKey(key);
    broadcastPreferences({ openAiKey: key });

    setStartTime(dayjs());
    try {
      await mutateAsync({
        openAiKey: key,
      });
    } catch (e) {
      console.error(e);
      setInlineError(e instanceof Error ? e.message : "Mimessage couldn’t create the search index.");
      setStartTime(null);
      return;
    }
    setStartTime(null);
    setModalOpen(false);
  };

  const progress: EmbeddingsCreationProgress = rawProgress ?? {
    completedRecords: 0,
    status: isCreatingEmbeddings ? "running" : "idle",
    totalRecords: count || 0,
  };
  const hasProgressInEmbeddings = isCreatingEmbeddings || progress.status === "running";
  const completed = progress.completedRecords;
  const totalMessages = progress.totalRecords || count || 0;
  const completedThisSession = completed;
  const leftToComplete = Math.max(totalMessages - completed, 0);
  const timeElapsed = startTime ? dayjs().diff(startTime, "seconds") / 60 : 0;
  const timeRemaining =
    stats && completedThisSession > 0 && timeElapsed > 0
      ? humanReadableMinutes(leftToComplete / (completedThisSession / timeElapsed))
      : "Unknown";

  return (
    <NativeModal className="semantic-search-backdrop" onClose={() => setModalOpen(false)} open={modalOpen}>
      <dialog
        open
        aria-busy={hasProgressInEmbeddings}
        aria-describedby="semantic-search-description"
        aria-labelledby="semantic-search-title"
        aria-modal="true"
        className="messages-modal messages-sheet semantic-search-modal"
      >
        <header className="messages-modal-header semantic-search-header">
          <h1 className="messages-modal-title" id="semantic-search-title">
            Set Up Semantic Search
          </h1>
          <p className="messages-modal-subtitle" id="semantic-search-description">
            Search by meaning instead of exact words. Mimessage will create an AI index of your messages using your
            OpenAI API key. Creating the index may take a while and incur API charges.
          </p>
        </header>

        <div className="messages-modal-content semantic-search-content">
          {isFetching && <progress className="semantic-search-loading" aria-label="Calculating estimates" />}
          {hasProgressInEmbeddings ? (
            <div className="semantic-search-progress" role="status" aria-live="polite">
              <div className="semantic-search-progress-heading">
                <strong>Creating search index…</strong>
                <span>{totalMessages ? `${Math.min(Math.round((completed / totalMessages) * 100), 100)}%` : "0%"}</span>
              </div>
              <progress
                className="semantic-search-progress-bar"
                max={totalMessages || 1}
                value={Math.min(completed, totalMessages || 1)}
              />
              <p className="semantic-search-progress-label">
                {completed.toLocaleString()} of {totalMessages.toLocaleString()} messages indexed
              </p>
            </div>
          ) : (
            <div className="semantic-search-field-group">
              <label className="messages-field-row semantic-search-field-row" htmlFor="semantic-search-api-key">
                <span className="semantic-search-field-label">API key:</span>
                <input
                  autoFocus
                  autoComplete="off"
                  className="messages-text-field semantic-search-key-field"
                  defaultValue={openAiKey || ""}
                  id="semantic-search-api-key"
                  placeholder="Enter your OpenAI API key"
                  ref={ref}
                  type="password"
                  aria-invalid={Boolean(inlineError)}
                  onChange={() => inlineError && setInlineError(null)}
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => event.key === "Enter" && void onSubmit()}
                />
              </label>
              <p className="semantic-search-field-note">
                Your key stays on this Mac and is sent only to OpenAI when building or using the search index.
              </p>
              {inlineError && (
                <p className="messages-inline-error semantic-search-error" role="alert">
                  {inlineError}
                </p>
              )}
            </div>
          )}
          {stats && (
            <dl className="semantic-search-stats">
              <div className="semantic-search-stat">
                <dt>Unique messages</dt>
                <dd>{stats.totalMessages.toLocaleString()}</dd>
              </div>
              <div className="semantic-search-stat">
                <dt>Estimated cost</dt>
                <dd>{stats.estimatedPrice.toLocaleString("en", { currency: "USD", style: "currency" })}</dd>
              </div>
              <div className="semantic-search-stat">
                <dt>Total tokens</dt>
                <dd>{stats.totalTokens.toLocaleString()}</dd>
              </div>
              <div className="semantic-search-stat">
                <dt>Estimated time</dt>
                <dd>
                  {hasProgressInEmbeddings && completed > 0
                    ? timeRemaining
                    : humanReadableMinutes(stats.estimatedTimeMin)}
                </dd>
              </div>
              <div className="semantic-search-stat">
                <dt>Average tokens per message</dt>
                <dd>{stats.averageTokensPerLine.toLocaleString()}</dd>
              </div>
              <div className="semantic-search-stat">
                <dt>Messages already indexed</dt>
                <dd>{Math.max(stats.completedAlready || 0, completed).toLocaleString()}</dd>
              </div>
            </dl>
          )}
        </div>
        <footer className="messages-modal-actions semantic-search-actions">
          {!stats && (
            <button
              type="button"
              className="semantic-search-estimate-button"
              disabled={hasProgressInEmbeddings}
              onClick={() => setShowStats(true)}
            >
              Estimate Time &amp; Cost
            </button>
          )}
          <span className="semantic-search-action-spacer" aria-hidden="true" />
          <button type="button" onClick={() => setModalOpen(false)}>
            {hasProgressInEmbeddings ? "Continue in Background" : "Cancel"}
          </button>
          {!hasProgressInEmbeddings && (
            <button type="button" className="messages-modal-button--primary" onClick={() => void onSubmit()}>
              Create Index
            </button>
          )}
        </footer>
      </dialog>
    </NativeModal>
  );
};
export const SemanticSearchInfo = ({ label }: { label?: string }) => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="semantic-search-info">
      {modalOpen && <SemanticSearchModal modalOpen={modalOpen} setModalOpen={setModalOpen} />}
      <button
        type="button"
        aria-label="Set up semantic search"
        className={`semantic-search-info-button${label ? " has-label" : ""}`}
        title="Set up semantic search"
        onClick={() => setModalOpen(true)}
      >
        <SparklesIcon />
        {label ? <span>{label}</span> : null}
      </button>
    </div>
  );
};
