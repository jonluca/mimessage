import React, { useRef, useState } from "react";
import type { Message } from "../../interfaces";
import { useMimessage } from "../../context";
import { MessageBubbleText } from "./MessageBubble";
import { useHomeDir, useOpenFileAtLocation } from "../../hooks/dataHooks";
import { SystemSymbol } from "../SystemSymbol";

const VIDEO_TYPES = new Set(["3gp", "avi", "m4v", "mov", "mp4", "webm"]);
const IMAGE_TYPES = new Set([
  "bmp",
  "gif",
  "heic",
  "heics",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);
const AUDIO_TYPES = new Set(["aac", "aif", "aiff", "amr", "caf", "flac", "m4a", "mp3", "ogg", "wav"]);
const CONTACT_TYPES = new Set(["loc.vcf", "vcf"]);
const audioWaveBars = Array.from({ length: 24 }, (_, index) => index);

export const getExternalHttpUrl = (value: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!URL.canParse(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const encodePath = (value: string) => value.split("/").map(encodeURIComponent).join("/");

const getExtension = (message: Message) => {
  const candidate = message.transfer_name || message.filename || "";
  const leaf = candidate.split("/").at(-1) || "";
  const lower = leaf.toLocaleLowerCase();
  return lower.endsWith(".loc.vcf") ? "loc.vcf" : lower.split(".").at(-1) || "";
};

export const isPluginPayloadAttachment = (message: Pick<Message, "filename" | "transfer_name">) =>
  (message.transfer_name || message.filename || "").toLocaleLowerCase().endsWith(".pluginpayloadattachment");

const getFileName = (message: Message) => {
  const candidate = message.transfer_name || message.filename?.split("/").at(-1) || "Attachment";
  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};

const FileGlyph = ({ label }: { label: string }) => (
  <span aria-hidden="true" className="attachment-file-glyph">
    <SystemSymbol name="doc-fill" />
    <span>{label}</span>
  </span>
);

const ContactGlyph = () => (
  <span aria-hidden="true" className="attachment-contact-glyph">
    <SystemSymbol name="person-crop-circle-fill" />
  </span>
);

const LinkGlyph = () => (
  <span aria-hidden="true" className="attachment-link-glyph">
    <SystemSymbol name="link" />
  </span>
);

const FinderArrow = () => <SystemSymbol className="attachment-card-arrow" name="arrow-up-right" />;

const getAttachmentSource = (message: Message, homedir: string | null | undefined) => {
  const originalPath = message.filename || "";
  const absolutePath = originalPath.startsWith("~/")
    ? homedir
      ? `${homedir}${originalPath.slice(1)}`
      : ""
    : originalPath;
  return {
    absolutePath,
    source: absolutePath ? `mimessage-asset://${encodePath(absolutePath)}` : "",
  };
};

const AttachmentLinkCard = ({ expanded, previewSrc, url }: { expanded: boolean; previewSrc?: string; url: URL }) => {
  const host = url.hostname.replace(/^www\./u, "");
  const detail = url.pathname === "/" ? "Website" : url.pathname;
  return (
    <a
      aria-label={`Open link to ${host}`}
      className={`attachment-link-card${expanded ? " is-expanded" : ""}`}
      href={url.toString()}
      rel="noreferrer"
      target="_blank"
    >
      {previewSrc ? <img alt="" className="attachment-link-preview-icon" src={previewSrc} /> : <LinkGlyph />}
      <span className="attachment-card-copy">
        <span className="attachment-card-kicker">Link</span>
        <strong>{host}</strong>
        <span className="attachment-card-detail">{detail}</span>
      </span>
      <FinderArrow />
    </a>
  );
};

export const RichLinkAttachmentView = ({
  attachments,
  message,
  recalcSize,
}: {
  attachments: Message[];
  message: Message;
  recalcSize?: () => void | undefined;
}) => {
  const { data: homedir } = useHomeDir();
  const [heroFailed, setHeroFailed] = useState(false);
  const metadata = message.link_metadata;
  const url = getExternalHttpUrl(metadata?.originalUrl || message.text);
  if (!url) {
    return <AttachmentView message={message} recalcSize={recalcSize} />;
  }

  const pluginAttachments = attachments.filter(isPluginPayloadAttachment);
  const iconAttachment = pluginAttachments[metadata?.iconAttachmentIndex ?? 0];
  const imageAttachment = pluginAttachments[metadata?.imageAttachmentIndex ?? 1];
  const iconSource = iconAttachment ? getAttachmentSource(iconAttachment, homedir).source : "";
  const imageSource = imageAttachment ? getAttachmentSource(imageAttachment, homedir).source : "";
  const host = url.hostname.replace(/^www\./u, "");
  const title = metadata?.title || host;

  return (
    <div className="attachment-view attachment-rich-link-view" data-attachment-kind="rich-link">
      <a
        aria-label={`Open ${title} on ${host}`}
        className="attachment-rich-link-card"
        href={url.toString()}
        rel="noreferrer"
        target="_blank"
      >
        {imageSource && !heroFailed ? (
          <img
            alt=""
            className="attachment-rich-link-image"
            decoding="async"
            src={imageSource}
            onError={() => {
              setHeroFailed(true);
              recalcSize?.();
            }}
            onLoad={recalcSize}
          />
        ) : (
          <span className="attachment-rich-link-fallback" aria-hidden="true">
            {iconSource ? <img alt="" src={iconSource} /> : <LinkGlyph />}
          </span>
        )}
        <span className="attachment-rich-link-caption">
          <strong>{title}</strong>
          <span>{host}</span>
        </span>
      </a>
    </div>
  );
};

interface AttachmentFileCardProps {
  available: boolean;
  expanded: boolean;
  fileName: string;
  fileType: string;
  isContact: boolean;
  isPdf: boolean;
  mimeType: string;
  missing?: boolean;
  onReveal: () => void;
}

const AttachmentFileCard = ({
  available,
  expanded,
  fileName,
  fileType,
  isContact,
  isPdf,
  mimeType,
  missing = false,
  onReveal,
}: AttachmentFileCardProps) => {
  const kind = isContact
    ? "Contact Card"
    : isPdf
      ? "PDF Document"
      : mimeType || (fileType ? `${fileType.toLocaleUpperCase()} File` : "Attachment");
  const badge = isPdf ? "PDF" : fileType ? fileType.slice(0, 4).toLocaleUpperCase() : "FILE";
  return (
    <button
      aria-label={available ? `Reveal ${fileName} in Finder` : `${fileName} is unavailable`}
      className={`attachment-file-card${expanded ? " is-expanded" : ""}${missing ? " is-missing" : ""}`}
      disabled={!available}
      title={available ? "Reveal in Finder" : "Open Messages to download this attachment"}
      type="button"
      onClick={onReveal}
    >
      {isContact ? <ContactGlyph /> : <FileGlyph label={missing ? "!" : badge} />}
      <span className="attachment-card-copy">
        <strong>{fileName}</strong>
        <span className="attachment-card-detail">{missing ? "Download in Messages" : kind}</span>
      </span>
      {available ? <FinderArrow /> : null}
    </button>
  );
};

interface AttachmentAudioCardProps {
  expanded: boolean;
  fallback: React.ReactNode;
  fileName: string;
  filename: string;
  recalcSize?: () => void;
}

const AttachmentAudioCard = ({ expanded, fallback, fileName, filename, recalcSize }: AttachmentAudioCardProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return fallback;
  }

  const toggleAudio = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setLoadFailed(true);
        recalcSize?.();
      }
    } else {
      audio.pause();
    }
  };

  const remaining = duration > 0 ? Math.max(0, duration - currentTime) : 0;
  return (
    <div className={`attachment-audio-card${expanded ? " is-expanded" : ""}`}>
      <button
        aria-label={playing ? `Pause ${fileName}` : `Play ${fileName}`}
        className="attachment-audio-play"
        type="button"
        onClick={() => void toggleAudio()}
      >
        {playing ? <SystemSymbol name="pause-fill" /> : <SystemSymbol name="play-fill" />}
      </button>
      <span aria-hidden="true" className="attachment-audio-waveform">
        {audioWaveBars.map((bar) => (
          <i key={bar} />
        ))}
      </span>
      <span className="attachment-audio-duration">{formatDuration(playing ? remaining : duration)}</span>
      <audio
        ref={audioRef}
        preload="metadata"
        src={filename}
        onDurationChange={(event) => {
          setDuration(event.currentTarget.duration);
          recalcSize?.();
        }}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setLoadFailed(true);
          recalcSize?.();
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
    </div>
  );
};

interface AttachmentVisualAssetProps {
  expanded: boolean;
  fallback: React.ReactNode;
  fileName: string;
  fileType: string;
  filename: string;
  isImage: boolean;
  message: Message;
  recalcSize?: () => void;
}

const AttachmentVisualAsset = ({
  expanded,
  fallback,
  fileName,
  fileType,
  filename,
  isImage,
  message,
  recalcSize,
}: AttachmentVisualAssetProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const setHighlightedMessage = useMimessage((state) => state.setHighlightedMessage);
  const markLoadFailed = () => {
    setLoadFailed(true);
    recalcSize?.();
  };

  if (loadFailed) {
    return fallback;
  }
  if (isImage) {
    if (expanded) {
      return (
        <img
          alt={fileName}
          className="attachment-asset attachment-image is-expanded"
          decoding="async"
          src={filename}
          onError={markLoadFailed}
          onLoad={recalcSize}
        />
      );
    }
    return (
      <button
        aria-label={`Preview ${fileName}`}
        className="attachment-visual-button"
        type="button"
        onClick={() => setHighlightedMessage(message)}
      >
        <img
          alt=""
          className="attachment-asset attachment-image"
          decoding="async"
          loading="lazy"
          src={filename}
          onError={markLoadFailed}
          onLoad={recalcSize}
        />
        {fileType === "gif" ? <span className="attachment-format-badge">GIF</span> : null}
      </button>
    );
  }
  if (expanded) {
    return (
      <video
        className="attachment-asset attachment-video is-expanded"
        controls
        playsInline
        preload="metadata"
        ref={videoRef}
        src={filename}
        onError={markLoadFailed}
        onLoadedMetadata={recalcSize}
      />
    );
  }
  return (
    <button
      aria-label={`Preview ${fileName}`}
      className="attachment-visual-button"
      type="button"
      onClick={() => setHighlightedMessage(message)}
    >
      <video
        aria-hidden="true"
        className="attachment-asset attachment-video"
        crossOrigin="anonymous"
        muted
        playsInline
        preload="metadata"
        ref={videoRef}
        src={filename}
        onError={markLoadFailed}
        onLoadedMetadata={recalcSize}
      />
      <span aria-hidden="true" className="attachment-video-play">
        <SystemSymbol name="play-fill" />
      </span>
    </button>
  );
};

export const AttachmentView = ({
  expanded = false,
  message,
  recalcSize,
}: {
  expanded?: boolean;
  recalcSize?: () => void | undefined;
  message: Message;
}) => {
  const { data: homedir } = useHomeDir();
  const openFileAtLocation = useOpenFileAtLocation();
  const { absolutePath, source: filename } = getAttachmentSource(message, homedir);
  const fileType = getExtension(message);
  const fileName = getFileName(message);
  const mimeType = message.mime_type?.toLocaleLowerCase() || "";
  const isVideo = mimeType.startsWith("video/") || VIDEO_TYPES.has(fileType);
  const isImage = mimeType.startsWith("image/") || IMAGE_TYPES.has(fileType);
  const isAudio = mimeType.startsWith("audio/") || AUDIO_TYPES.has(fileType);
  const isContact = mimeType.includes("vcard") || CONTACT_TYPES.has(fileType);
  const isPdf = mimeType === "application/pdf" || fileType === "pdf";
  const isPluginPayload = fileType === "pluginpayloadattachment";
  const externalUrl = getExternalHttpUrl(message.text);

  const fileCard = (missing = false) => (
    <AttachmentFileCard
      available={Boolean(absolutePath) && !isPluginPayload}
      expanded={expanded}
      fileName={fileName}
      fileType={fileType}
      isContact={isContact}
      isPdf={isPdf}
      mimeType={mimeType}
      missing={missing}
      onReveal={() => {
        if (absolutePath) {
          void openFileAtLocation(absolutePath);
        }
      }}
    />
  );

  let content: React.ReactNode = fileCard(!filename);
  if (externalUrl && (!filename || isPluginPayload)) {
    content = (
      <AttachmentLinkCard expanded={expanded} previewSrc={isPluginPayload ? filename : undefined} url={externalUrl} />
    );
  } else if (isAudio && filename) {
    content = (
      <AttachmentAudioCard
        expanded={expanded}
        fallback={fileCard()}
        fileName={fileName}
        filename={filename}
        recalcSize={recalcSize}
      />
    );
  } else if ((isImage || isVideo) && filename) {
    content = (
      <AttachmentVisualAsset
        expanded={expanded}
        fallback={fileCard()}
        fileName={fileName}
        fileType={fileType}
        filename={filename}
        isImage={isImage}
        message={message}
        recalcSize={recalcSize}
      />
    );
  }

  const kind =
    externalUrl && (!filename || isPluginPayload)
      ? "link"
      : isAudio
        ? "audio"
        : isImage
          ? "image"
          : isVideo
            ? "video"
            : isContact
              ? "contact"
              : isPdf
                ? "pdf"
                : "file";

  return (
    <div className={`attachment-view${expanded ? " is-expanded" : ""}`} data-attachment-kind={kind}>
      {content}
      {message.text && !externalUrl ? (
        <div className={`attachment-caption${expanded ? " is-expanded" : ""}`}>
          <MessageBubbleText text={message.text} />
        </div>
      ) : null}
    </div>
  );
};
