import {
  NaiveDateTime,
  DateTime,
  Local,
  TimeZone
} from "chrono-node";
import { Value } from "plist";
import { Connection, Error, Result, Row, Statement } from "better-sqlite3";

import {
  BubbleEffect,
  Expressive,
  ScreenEffect,
  Announcement,
  CustomBalloon,
  Reaction,
  Variant
} from "../message_types";
import {
  read_diff as readable_diff,
  TIMESTAMP_FACTOR
} from "../util/dates";
import { done_processing, processing } from "../util/output";
import { QueryContext, streamtyped } from "../util";
import {
  ATTRIBUTED_BODY,
  CHAT_MESSAGE_JOIN,
  MESSAGE,
  MESSAGE_ATTACHMENT_JOIN,
  MESSAGE_PAYLOAD,
  MESSAGE_SUMMARY_INFO,
  Diagnostic,
  Cacheable,
  Table
} from "./table";

const ATTACHMENT_CHAR = "\u{FFFC}";
const APP_CHAR = "\u{FFFD}";
const REPLACEMENT_CHARS = [ATTACHMENT_CHAR, APP_CHAR];

export type MessageType<T> = {
  Normal: [Variant<T>, Expressive<T>];
  Thread: [Variant<T>, Expressive<T>];
  Reply: [Variant<T>, Expressive<T>];
};

export type BubbleType<T> = {
  Text: string;
  Attachment: any;
  App: any;
};

export type Service<T> = {
  iMessage: any;
  SMS: any;
  Other: string;
  Unknown: any;
};

export interface Message {
  rowid: number;
  guid: string;
  text?: string;
  service?: string;
  handle_id: number;
  subject?: string;
  date: number;
  date_read: number;
  date_delivered: number;
  is_from_me: boolean;
  is_read: boolean;
  item_type: number;
  group_title?: string;
  group_action_type: number;
  associated_message_guid?: string;
  associated_message_type?: number;
  balloon_bundle_id?: string;
  expressive_send_style_id?: string;
  thread_originator_guid?: string;
  thread_originator_part?: string;
  date_edited: number;
  chat_id?: number;
  num_attachments: number;
  num_replies: number;
}

export const Message: Table<Message> = {
  from_row(row: Row): Result<Message> {
    return {
      rowid: row.get("rowid"),
      guid: row.get("guid"),
      text: row.get("text") || undefined,
      service: row.get("service") || undefined,
      handle_id: row.get("handle_id"),
      subject: row.get("subject") || undefined,
      date: row.get("date"),
      date_read: row.get("date_read") || 0,
      date_delivered: row.get("date_delivered") || 0,
      is_from_me: row.get("is_from_me"),
      is_read: row.get("is_read"),
      item_type: row.get("item_type") || 0,
      group_title: row.get("group_title") || undefined,
      group_action_type: row.get("group_action_type") || 0,
      associated_message_guid: row.get("associated_message_guid") || undefined,
      associated_message_type: row.get("associated_message_type") || undefined,
      balloon_bundle_id: row.get("balloon_bundle_id") || undefined,
      expressive_send_style_id: row.get("expressive_send_style_id") || undefined,
      thread_originator_guid: row.get("thread_originator_guid") || undefined,
      thread_originator_part: row.get("thread_originator_part") || undefined,
      date_edited: row.get("date_edited") || 0,
      chat_id: row.get("chat_id") || undefined,
      num_attachments: row.get("num_attachments"),
      num_replies: row.get("num_replies")
    };
  },

  async get(db: Connection): Promise<Statement> {
    // If database has `thread_originator_guid`, we can parse replies, otherwise default to 0

    // NOTE: removed panic catching (use of `unwrap_or/unwrap_or_else`), TypeScript will throw a runtime error instead
    // Implement proper error handling if necessary

    let sql: string;
    try {
      sql = `SELECT
               *,
               c.chat_id,
               (SELECT COUNT(*) FROM ${MESSAGE_ATTACHMENT_JOIN} a WHERE m.ROWID = a.message_id) as num_attachments,
               (SELECT COUNT(*) FROM ${MESSAGE} m2 WHERE m2.thread_originator_guid = m.guid) as num_replies
           FROM
               message as m
               LEFT JOIN ${CHAT_MESSAGE_JOIN} as c ON m.ROWID = c.message_id
           ORDER BY
               m.date;`;
      return db.prepare(sql);
    } catch {
      sql = `SELECT
               *,
               c.chat_id,
               (SELECT COUNT(*) FROM ${MESSAGE_ATTACHMENT_JOIN} a WHERE m.ROWID = a.message_id) as num_attachments,
               (SELECT 0) as num_replies
           FROM
               message as m
               LEFT JOIN ${CHAT_MESSAGE_JOIN} as c ON m.ROWID = c.message_id
           ORDER BY
               m.date;`;
      return db.prepare(sql);
    }
  },

  extract(message: Result<Result<Message, Error>, Error>): Result<Message, TableError> {
    // TODO: When does this occur?
    // TS Note: Original use of `unwrap_or` is removed.
    // Implement proper error handling if necessary

    const result = message;
    if (result instanceof Error) {
      throw new TableError("Messages", result);
    }

    const msg = result;
    if (msg instanceof Error) {
      throw new TableError("Messages", msg);
    }

    return msg;
  }
};

export const MessageDiagnostic: Diagnostic<Message> = {
  run_diagnostic(db: Connection) {
    processing();
    const messages_without_chat = db
      .prepare(`SELECT
                  COUNT(m.rowid)
                FROM
                  ${MESSAGE} as m
                  LEFT JOIN ${CHAT_MESSAGE_JOIN} as c ON m.rowid = c.message_id
                WHERE
                  c.chat_id is NULL
                ORDER BY
                  m.date;`);

    const num_dangling: number | undefined = messages_without_chat
      .query_row([])?.get(0)
      || undefined;

    done_processing();

    if (num_dangling && num_dangling > 0) {
      console.log(`\rMessages not associated with a chat: ${num_dangling}`);
    }
  }
};

// TODO: Implement implementation of `Cacheable` trait with translations to TypeScriptimport { Local, DateTime } from 'luxon';
import { MessageError, TableError } from '../errors';
import { Connection, QueryContext } from '../interfaces';
import { readable_diff } from '../utils';
import { Variant, CustomBalloon, Reaction } from './variants';

export class Message {
    date_read(offset: number): DateTime<Local> | MessageError {
        return this.get_local_time(this.date_read, offset);
    }

    date_edited(offset: number): DateTime<Local> | MessageError {
        return this.get_local_time(this.date_edited, offset);
    }

    time_until_read(offset: number): string | null {
        if (!this.is_from_me && this.date_read !== 0 && this.date !== 0) {
            return readable_diff(this.date(offset), this.date_read(offset));
        } else if (this.is_from_me && this.date_delivered !== 0 && this.date !== 0) {
            return readable_diff(this.date(offset), this.date_delivered(offset));
        }
        return null;
    }

    is_reply(): boolean {
        return this.thread_originator_guid !== undefined;
    }

    is_announcement(): boolean {
        return this.group_title !== undefined || this.group_action_type !== 0;
    }

    is_reaction(): boolean {
        return this.variant() === Variant.Reaction || (this.is_sticker() && this.associated_message_guid !== undefined);
    }

    is_sticker(): boolean {
        return this.variant() === Variant.Sticker;
    }

    is_expressive(): boolean {
        return this.expressive_send_style_id !== undefined;
    }

    is_url(): boolean {
        return this.variant() === Variant.App(CustomBalloon.URL);
    }

    is_edited(): boolean {
        return this.date_edited !== 0;
    }

    has_attachments(): boolean {
        return this.num_attachments > 0;
    }

    has_replies(): boolean {
        return this.num_replies > 0;
    }

    is_shareplay(): boolean {
        return this.item_type === 6;
    }

    get_reply_index(): number {
        if (this.thread_originator_part !== undefined) {
            const parts = this.thread_originator_part.split(':');
            const part = parts.shift();
            return parseInt(part ?? '0', 10);
        }
        return 0;
    }

    async get_count(db: Connection, context: QueryContext): Promise<number> {
        // Implementation of get_count function
    }

    async stream_rows(db: Connection, context: QueryContext): Promise<Statement> {
        // Implementation of stream_rows function
    }

    clean_associated_guid(): [number, string] | null {
        if (this.associated_message_guid !== undefined) {
            if (this.associated_message_guid.startsWith('p:')) {
                const [indexStr, messageId] = this.associated_message_guid.split('/');
                const index = parseInt(indexStr.replace('p:', ''), 10);
                return [index, messageId.slice(0, 36)];
            } else if (this.associated_message_guid.startsWith('bp:')) {
                return [0, this.associated_message_guid.slice(3, 39)];
            } else {
                return [0, this.associated_message_guid.slice(0, 36)];
            }
        }
        return null;
    }

    reaction_index(): number {
        const associatedGuid = this.clean_associated_guid();
        return associatedGuid ? associatedGuid[0] : 0;
    }

    async get_reactions(db: Connection, reactions: Map<string, string[]>): Promise<Map<number, Message[]>> {
        // Implementation of get_reactions function
    }

    async get_replies(db: Connection): Promise<Map<number, Message[]>> {
        // Implementation of get_replies function
    }

    parse_balloon_bundle_id(): string | null {
        if (this.balloon_bundle_id !== undefined) {
            const parts = this.balloon_bundle_id.split(':');
            const bundleId = parts.shift();
            return parts.length === 0 ? bundleId ?? null : parts.shift() ?? null;
        }
        return null;
    }

    variant(): Variant {
        // Implementation of variant function
    }
}type Announcement = "NameChange" | "PhotoChange" | "Unknown";

type Service = "iMessage" | "SMS" | "Unknown";

export class Message {
  variant(): Variant {
    // ...
  }

  getAnnouncement(): Announcement | null {
    if (this.group_title) {
      return "NameChange";
    }

    return this.group_action_type === 0 ? null : "Unknown";
  }

  service(): Service {
    switch (this.service) {
      case "iMessage":
        return "iMessage";
      case "SMS":
        return "SMS";
      default:
        return "Unknown";
    }
  }
}

if (typeof module !== "undefined") {
  module.exports = Message;
}import { assert } from "chai";

class Message {
  associated_message_guid: string | null;

  constructor() {
    this.associated_message_guid = null;
  }

  clean_associated_guid(): [number, string] | null {
    if (this.associated_message_guid) {
      const match = this.associated_message_guid.match(/^bp:([A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-Z0-9]{12})$/i);
      if (match) {
        return [0, match[1]];
      }
    }
    return null;
  }
}

function blank() {
  return new Message();
}

describe("Message", () => {
  it("should get correct guid", () => {
    const m = blank();
    m.associated_message_guid = "bp:A44CE9D7-AAAA-BBBB-CCCC-23C54E1A9B6A".toString();

    assert.deepEqual(m.clean_associated_guid(), [0, "A44CE9D7-AAAA-BBBB-CCCC-23C54E1A9B6A"]);
  });

  it("cant get invalid guid bp", () => {
    const m = blank();
    m.associated_message_guid = "bp:FAKE_GUID".toString();

    assert.equal(m.clean_associated_guid(), null);
  });
});