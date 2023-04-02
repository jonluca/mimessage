import {Value} from "plist";
import {
  CollaborationMessage,
  MusicMessage,
  URLMessage,
} from "./message_types";

export enum Reaction {
  Loved,
  Liked,
  Disliked,
  Laughed,
  Emphasized,
  Questioned,
}

export enum CustomBalloon {
  Application = "Application",
  URL = "URL",
  Handwriting = "Handwriting",
  ApplePay = "ApplePay",
  Fitness = "Fitness",
  Slideshow = "Slideshow",
}

export enum URLOverride {
  Normal = "Normal",
  AppleMusic = "AppleMusic",
  Collaboration = "Collaboration",
}

export enum Announcement {
  NameChange = "NameChange",
  PhotoChange = "PhotoChange",
  Unknown = "Unknown",
}

export type Variant =
  | {type: "Reaction"; args: [number, boolean, Reaction]}
  | {type: "Sticker"; args: [number]}
  | {type: "Unknown"; args: [number]}
  | {type: "App"; args: [CustomBalloon]}
  | {type: "Normal"}
  | {type: "Edited"}
  | {type: "SharePlay"};

export interface BalloonProvider {
  fromMap(payload: Value): Result<this, PlistParseError>;
}