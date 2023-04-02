import fs from "fs";
import path from "path";
import { Config } from "../runtime";
import { Exporter, Writer } from "./exporter";
import { TableError, RuntimeError } from "../app/error";
import { Message, BubbleType, Attachment } from "../../imessage-database/tables/message";
import { buildProgressBarExport } from "../app/progress";
import { format, readableDiff } from "../../imessage-database/util/dates";
import { parsePlist, PlistParseError } from "../../imessage-database/util/plist";
import {
  AppMessage,
  CollaborationMessage,
  EditedMessage,
  Expressive,
  MusicMessage,
  URLMessage,
  Variant,
  Announcement,
  BalloonProvider,
  CustomBalloon,
  URLOverride,
} from "../../imessage-database/message_types";

export class TXT {
  config: Config;
  files: Map<number, string>;
  orphaned: string;

  constructor(config: Config) {
    this.config = config;
    this.files = new Map();
    this.orphaned = path.join(config.options.exportPath, "orphaned.txt");
  }

  async iterMessages(): Promise<void> {
    console.error(`Exporting to ${this.config.options.exportPath} as txt...`);

    const totalMessages = await Message.getCount(
      this.config.db,
      this.config.options.queryContext
    );
    const progressBar = buildProgressBarExport(totalMessages);
    let currentMessage = 0;

    const messages = await Message.streamRows(
      this.config.db,
      this.config.options.queryContext
    );

    for (const message of messages) {
      const msg = await Message.extract(message);
      if (msg.isAnnouncement()) {
        const announcement = this.formatAnnouncement(msg);
        await TXT.writeToFile(this.getOrCreateFile(msg), announcement);
      } else if (!msg.isReaction()) {
        await msg.genText(this.config.db);
        const formattedMessage = await this.formatMessage(msg, 0);
        await TXT.writeToFile(this.getOrCreateFile(msg), formattedMessage);
      }

      currentMessage += 1;
      if (currentMessage % 99 === 0) {
        progressBar.position(currentMessage);
      }
    }

    progressBar.finish();
  }

  getOrCreateFile(message: Message): string {
    const { chatroom, id } = this.config.getConversationInfo(message.chat_id);
    if (!chatroom || !id) {
      return this.orphaned;
    }

    if (!this.files.has(id)) {
      const filePath = path.join(
        this.config.options.exportPath,
        this.config.getFileName(chatroom),
        ".txt"
      );
      this.files.set(id, filePath);
    }

    return this.files.get(id) as string;
  }

  static async writeToFile(filePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.appendFile(filePath, content, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// Implement rest of the code using the Writer interface
export interface TXTWriter extends TXT, Writer {}

Object.setPrototypeOf(TXT.prototype, Writer);

// Implement Writer methods here (formatMessage, formatAnnouncement, formatEdited, etc.)// Converted code to TypeScript:

import { URLMessage, MusicMessage, CollaborationMessage, AppMessage, IMessageExporterConfig } from "./types";
import { format, readable_diff } from "../utils";
import { MessageError, PlistParseError } from "../errors";
import { Variant } from "../enums";
import { Attachment, Expressive, BubbleEffect, ScreenEffect, Announcement, EditedMessage } from "../models";
import { Message } from "../database";
import * as fs from "fs";
import * as path from "path";

const YOU = "You";
const ME = "me";

export class TXT {
    config: IMessageExporterConfig;
    output: string;
    out_path: string;

    constructor(config: IMessageExporterConfig) {
        this.config = config;
        this.output = path.join(config.out_path, "text");
        this.out_path = path.join(this.output, "Chat");

        if (!fs.existsSync(this.output)) {
            fs.mkdirSync(this.output, { recursive: true });
        }

        if (!fs.existsSync(this.out_path)) {
            fs.mkdirSync(this.out_path, { recursive: true });
        }
    }

    format_url(this: TXT, balloon: URLMessage, indent: string): string {
        let out_s = "";

        if (balloon.url) {
            this.add_line(out_s, balloon.url, indent);
        } else if (balloon.original_url) {
            this.add_line(out_s, balloon.original_url, indent);
        }

        if (balloon.title) {
            this.add_line(out_s, balloon.title, indent);
        }

        if (balloon.summary) {
            this.add_line(out_s, balloon.summary, indent);
        }

        // We want to keep the newlines between blocks, but the last one should be removed
        return out_s.endsWith('\n') ? out_s.slice(0, -1) : out_s;
    }

    format_music(this: TXT, balloon: MusicMessage, indent: string): string {
        let out_s = "";

        if (balloon.track_name) {
            this.add_line(out_s, balloon.track_name, indent);
        }

        if (balloon.album) {
            this.add_line(out_s, balloon.album, indent);
        }

        if (balloon.artist) {
            this.add_line(out_s, balloon.artist, indent);
        }

        if (balloon.url) {
            this.add_line(out_s, balloon.url, indent);
        }

        return out_s;
    }

    format_collaboration(this: TXT, balloon: CollaborationMessage, indent: string): string {
        let out_s = indent;

        if (balloon.app_name) {
            out_s += balloon.app_name;
        } else if (balloon.bundle_id) {
            out_s += balloon.bundle_id;
        }

        if (!out_s.isEmpty()) {
            out_s += " message:\n";
        }

        if (balloon.title) {
            this.add_line(out_s, balloon.title, indent);
        }

        if (balloon.get_url()) {
            this.add_line(out_s, balloon.get_url(), indent);
        }

        // We want to keep the newlines between blocks, but the last one should be removed
        return out_s.endsWith('\n') ? out_s.slice(0, -1) : out_s;
    }

    format_handwriting(this: TXT, _: AppMessage, indent: string): string {
        return `${indent}Handwritten messages are not yet supported!`;
    }

    format_apple_pay(this: TXT, balloon: AppMessage, indent: string): string {
        let out_s = indent;
        if (balloon.caption) {
            out_s += balloon.caption;
            out_s += " transaction: ";
        }

        if (balloon.ldtext) {
            out_s += balloon.ldtext;
        } else {
            out_s += "unknown amount";
        }

        return out_s;
    }

    format_fitness(this: TXT, balloon: AppMessage, indent: string): string {
        let out_s = indent;
        if (balloon.app_name) {
            out_s += balloon.app_name;
            out_s += " message: ";
        }
        if (balloon.ldtext) {
            out_s += balloon.ldtext;
        } else {
            out_s += "unknown workout";
        }
        return out_s;
    }

    format_slideshow(this: TXT, balloon: AppMessage, indent: string): string {
        let out_s = indent;
        if (balloon.ldtext) {
            out_s += "Photo album: ";
            out_s += balloon.ldtext;
        }

        if (balloon.url) {
            out_s += ' ';
            out_s += balloon.url;
        }

        return out_s;
    }

    format_generic_app(
        this: TXT,
        balloon: AppMessage,
        bundle_id: string,
        _: Array<Attachment>,
        indent: string,
    ): string {
        let out_s = indent;

        if (balloon.app_name) {
            out_s += balloon.app_name;
        } else {
            out_s += bundle_id;
        }

        if (!out_s.isEmpty()) {
            out_s += " message:\n";
        }

        if (balloon.title) {
            this.add_line(out_s, balloon.title, indent);
        }

        if (balloon.subtitle) {
            this.add_line(out_s, ballotype Options = {
    dbPath: string;
    noCopy: boolean;
    diagnostic: boolean;
    exportType: any;
    exportPath: string;
    queryContext: any;
    noLazy: boolean;
    customName: string | null;
};

export function fakeOptions(): Options {
    return {
        dbPath: defaultDbPath(),
        noCopy: false,
        diagnostic: false,
        exportType: null,
        exportPath: "",
        queryContext: {},
        noLazy: false,
        customName: null,
    };
}type Balloon = {
    subtitle: string | null;
    caption: string | null;
    subcaption: string | null;
    trailing_caption: string | null;
    trailing_subcaption: string | null;
    app_name: string | null;
    ldtext: string | null;
};

class Exporter {
    format_generic_app(
        balloon: Balloon,
        bundle_id: string,
        attachments: any[] | null,
        date_time: string | null
    ): string {
        return (
            `${balloon.app_name} message:` +
            `\n${balloon.subtitle}` +
            `\n${balloon.caption}` +
            `\n${balloon.subcaption}` +
            `\n${balloon.trailing_caption}` +
            `\n${balloon.trailing_subcaption}`
        );
    }
}

{
    const exporter = new Exporter();
    const balloon: Balloon = {
        subtitle: "subtitle",
        caption: "caption",
        subcaption: "subcaption",
        trailing_caption: "trailing_caption",
        trailing_subcaption: "trailing_subcaption",
        app_name: "app_name",
        ldtext: "ldtext",
    };

    const expected = exporter.format_generic_app(
        balloon,
        "bundle_id",
        [],
        ""
    );
    const actual =
        "app_name message:\nsubtitle\ncaption\nsubcaption\ntrailing_caption\ntrailing_subcaption";

    console.assert(expected === actual);
}