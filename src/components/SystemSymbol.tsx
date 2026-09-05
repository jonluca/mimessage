import React from "react";

export type SystemSymbolName =
  | "arrow-up"
  | "arrow-up-right"
  | "checkmark-circle-fill"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "chevron-up-down"
  | "compose"
  | "doc-fill"
  | "envelope-fill"
  | "face-smiling"
  | "filter"
  | "folder-fill"
  | "gearshape-fill"
  | "gearshape"
  | "hand-thumbsdown-fill"
  | "hand-thumbsup-fill"
  | "heart-fill"
  | "link"
  | "location-fill"
  | "lock-fill"
  | "magnifyingglass"
  | "person-2-fill"
  | "person-fill"
  | "person-crop-circle-fill"
  | "pause-fill"
  | "phone-fill"
  | "play-fill"
  | "plus"
  | "plus-circle-fill"
  | "rectangle-stack-fill"
  | "sparkles"
  | "video"
  | "video-fill"
  | "waveform"
  | "xmark"
  | "xmark-circle-fill";

export const SystemSymbol = ({ className, name }: { className?: string; name: SystemSymbolName }) => (
  <span
    aria-hidden="true"
    className={["system-symbol", `system-symbol--${name}`, className].filter(Boolean).join(" ")}
  />
);
