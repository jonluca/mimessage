import { Path } from "path";

import {
  MessageError,
  PlistParseError,
  TableError,
  AppMessage,
  CollaborationMessage,
  MusicMessage,
  URLMessage,
  Attachment,
  Message
} from "imessage-database";

import { RuntimeError, Config } from "../app";

/**
 * Defines behavior for iterating over messages from the iMessage database and managing export files
 */
export interface Exporter {
  /**
   * Create a new exporter with references to the cached data
   */
  new(config: Config): Exporter;

  /**
   * Begin iterating over the messages table
   */
  iter_messages(): Promise<void>;

  /**
   * Get the file handle to write to, otherwise create a new one
   */
  get_or_create_file(message: Message): Path;
}

/**
 * Defines behavior for formatting message instances to the desired output format
 */
export interface Writer {
  /**
   * Format a message, including its reactions and replies
   */
  format_message(msg: Message, indent: number): Promise<string>;

  /**
   * Format an attachment, possibly by reading the disk
   */
  format_attachment(attachment: Attachment, msg: Message): Promise<string>;

  /**
   * Format an app message by parsing some of its fields
   */
  format_app(
    msg: Message,
    attachments: Attachment[],
    indent: string
  ): Promise<string>;

  /**
   * Format a reaction (displayed under a message)
   */
  format_reaction(msg: Message): Promise<string>;

  /**
   * Format an expressive message
   */
  format_expressive(msg: Message): string;

  /**
   * Format an announcement message
   */
  format_announcement(msg: Message): string;

  /**
   * Format a SharePlay message
   */
  format_shareplay(): string;

  /**
   * Format an edited message
   */
  format_edited(msg: Message, indent: string): Promise<string>;

  write_to_file(file: Path, text: string): void;
}

/**
 * Defines behavior for formatting custom balloons to the desired output format
 */
export interface BalloonFormatter<T> {
  /**
   * Format a URL message
   */
  format_url(balloon: URLMessage, indent: T): string;

  /**
   * Format an Apple Music message
   */
  format_music(balloon: MusicMessage, indent: T): string;

  /**
   * Format a Rich Collaboration message
   */
  format_collaboration(balloon: CollaborationMessage, indent: T): string;

  /**
   * Format a handwritten note message
   */
  format_handwriting(balloon: AppMessage, indent: T): string;

  /**
   * Format an Apple Pay message
   */
  format_apple_pay(balloon: AppMessage, indent: T): string;

  /**
   * Format a Fitness message
   */
  format_fitness(balloon: AppMessage, indent: T): string;

  /**
   * Format a Photo Slideshow message
   */
  format_slideshow(balloon: AppMessage, indent: T): string;

  /**
   * Format a generic app, generally third party
   */
  format_generic_app(
    balloon: AppMessage,
    bundle_id: string,
    attachments: Attachment[],
    indent: T
  ): string;
}