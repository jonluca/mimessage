import {MessageError, PlistParseError, TableError} from 'imessage-database';
import {
    AppMessage,
    CollaborationMessage,
    EditedMessage,
    BubbleEffect,
    Expressive,
    ScreenEffect,
    MusicMessage,
    URLMessage,
    Announcement,
    BalloonProvider,
    CustomBalloon,
    URLOverride,
    Variant
} from 'imessage-database';
import {
    Attachment,
    MediaType
} from 'imessage-database';
import {BubbleType, Message} from 'imessage-database';
import {Table, ATTACHMENTS_DIR, FITNESS_RECEIVER, ME, ORPHANED, UNKNOWN, YOU} from 'imessage-database';
import {format, readable_diff} from 'imessage-database';
import {home as dirs_home, parse_plist} from 'imessage-database';


import * as filetime from 'filetime';
import * as uuid from 'uuid/v4';

const HEADER = "<html>\n<meta charset=\"UTF-8\">";
const FOOTER = "</html>";
const STYLE = require('./resources/style.css');

class HTML {
    constructor(config) {
        this.config = config;
        this.files = new Map();
        this.orphaned = "";
    }

    static async write_headers(orphaned) {
        // TODO: Implement write_headers method
    }

    static async write_to_file(path, content) {
        // TODO: Implement write_to_file method
    }

    iter_messages() {
        // TODO: Implement iter_messages method
    }

    get_or_create_file(message) {
        // TODO: Implement get_or_create_file method
    }

    format_message(message, indent_size) {
        // TODO: Implement format_message method
    }

    add_line(formattedMessage, content, openTag, closeTag) {
        // TODO: Implement add_line method
    }

    get_time(message) {
        // TODO: Implement get_time method
    }

    format_announcement(message) {
        // TODO: Implement format_announcement method
    }

    format_edited(message, attachment) {
        // TODO: Implement format_edited method
    }

    format_attachement(message) {
        // TODO: Implement format_attachment method
    }

    format_app(message, attachments, name) {
        // TODO: Implement format_app method
    }

    format_expressive(message) {
        // TODO: Implement format_expressive method
    }

    format_shareplay(message) {
        // TODO: Implement format_shareplay method
    }

    format_reaction(message) {
        // TODO: Implement format_reaction method
    }
}

export default HTML;import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { MediaType } from './media-type';
import { Attachment, Message } from './types';
import { Config, home } from './config';
import { heicToJpeg } from './heic-to-jpeg';
import { TableError } from './table-error';
import { PlistParseError } from './plist-parse-error';

class Html {
  config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  addLine(target: string[], content: string, startDiv: string, endDiv: string): void {
    target.push(startDiv);
    target.push(content);
    target.push(endDiv);
  }

  async formatMessage(message: Message, indentSize: number): Promise<string> {
    const formattedMessage = ['<div class="message">'];

    if (message.attachments.length > 0 || message.balloon_bundle_path) {
      formattedMessage.push('<div class="rounded-button attachment">📎</div>');
    }

    this.addLine(formattedMessage, message.contact.name, '<span class="name">', '</span>');
    this.addLine(formattedMessage, message.formatted_date(), '<span class="timestamp">', '</span>');

    const formattedMessageContent = ['<div class="message-content">'];

    if (message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        this.addLine(
          formattedMessageContent,
          await this.format_attachment(attachment, message),
          '<div class="attachment">',
          '</div>',
        );
      }
    } else {
      const formattedText = message.text.replace(/\n/g, '<br>');
      this.addLine(formattedMessageContent, formattedText, '<p>', '</p>');
    }

    if (message.balloon_bundle_id) {
      try {
        const formattedText = await this.format_app(message, message.attachments, '');
        this.addLine(formattedMessageContent, formattedText, '<div class="app">', '</div>');
      } catch (error) {
        console.error(`Unable to retrieve app for message ${message.rowid}: ${error}`);
      }
    }

    formattedMessage.push(formattedMessageContent.join(''));

    const textReactions = message.text_reactions.replace(/\n/g, '<br>');
    this.addLine(formattedMessage, textReactions, '<div class="reaction">', '</div>');

    const replies = message.replies;
    const idx = message.rowid;

    if (replies.has(idx)) {
      this.addLine(formattedMessage, '<div class="replies">', '', '');

      for (const reply of replies.get(idx)!) {
        reply.gen_text(this.config.db);
        if (!reply.is_reaction()) {
          this.addLine(
            formattedMessage,
            await this.formatMessage(reply, 1),
            '<div class="reply">',
            '</div>',
          );
        }
      }

      this.addLine(formattedMessage, '</div>', '', '');
    }

    if (message.is_reply() && indentSize === 0) {
      this.addLine(
        formattedMessage,
        'This message responded to an earlier message.',
        '<span class="reply_context">',
        '</span>',
      );
    }

    formattedMessage.push('</div>');

    return formattedMessage.join('');
  }

  async format_attachment(
    attachment: Attachment,
    message: Message,
  ): Promise<string> {
    const attachmentPath = attachment.path();

    if (attachmentPath) {
      const resolvedAttachmentPath = attachmentPath.startsWith('~')
        ? attachmentPath.replace('~', home())
        : attachmentPath;

      if (!this.config.options.no_copy) {
        const qualifiedAttachmentPath = path.resolve(resolvedAttachmentPath);

        const ext = attachment.extension();

        if (ext) {
          let copyPath = this.config.attachment_path();

          const sub_dir = this.config.conversation_attachment_path(message.chat_id);
          copyPath = path.join(copyPath, sub_dir);

          const randomFileName = uuidv4();
          copyPath = path.join(copyPath, randomFileName);

          if (ext === 'heic' || ext === 'HEIC') {
            if (this.config.converter) {
              copyPath = copyPath + '.jpg';
              try {
                await heicToJpeg(qualifiedAttachmentPath, copyPath, this.config.converter);
              } catch (error) {
                console.error(`Unable to convert attachment ${attachment.filename()}: ${error}`);
                return `Unable to convert and display file: ${attachment.filename()}`;
              }
            }
          } else {
            copyPath = copyPath + '.' + ext;
            try {
              await fs.copyFile(qualifiedAttachmentPath, copyPath);
            } catch (error) {
              console.error(`Unable to copy attachment ${attachment.filename()}: ${error}`);
              return `Unable to display file: ${attachment.filename()}`;
            }
          }

          attachment.copied_path = copyPath;
        } else {
          return `Unable to display file: ${attachment.filename()}`;
        }
      }

      const embedPath = attachment.copied_path || resolvedAttachmentPath;

      const mimeType = attachment.mime_type();

      switch (mimeType.type) {
        case MediaType.Image:
          return this.config.options.no_lazy
            ? `<img src="${embedPath}">`
            : `<img src="${embedPath}" loading="lazy">`;
        case MediaType.Video:
          return `<video controls> <source src="${embedPath}" type="${mimeType.value}"> <source src="${embedPath}"> </video>`;
        case MediaType.Audio:
          return `<audio controls src="${embedPath}" type="${mimeType.value}"></audio>`;
        case MediaType.Text:
        case MediaType.Application:
          return `<a href="file://${embedPath}">Click to download ${attachment.filename()}</a>`;
        case MediaType.Unknown:
          return `<p>Unknown attachment type: ${embedPath}</p> <a href="file://${embedPath}">Download</a>`;
        case MediaType.Other:
          return `<p>Unable to embed ${mimeType.value} attachments: ${embedPath}</p>`;
      }
    } else {
      return `Unable to display file: ${attachment.filename()}`;
    }
  }

  async format_app(
    message: Message,
    attachments: Attachment[],
    _: string,
  ): Promise<string> {
    const balloon = message.balloonObj();

    return `<p>Unable to display app: ${attachments[0].filename()}</p>`;
  }
}import { URLMessage, URLOverride, AppMessage, CustomBalloon } from './app_messages';
import { Message, Variant, Expressive, ScreenEffect, BubbleEffect, Announcement } from './message';
import { Attachment } from './attachment';
import { format as readable_diff } from 'timeago.js';
import * as Path from 'path';
import { promises as fs } from 'fs';

async function formatUrl(self: HTML, balloon: URLMessage, _: Message): Promise<string> {
    let out_s = '';

    const url = balloon.getUrl();
    if (url) {
        out_s += `<a href="${url}">`;
    }

    out_s += '<div class="app_header">';

    for (const image of balloon.images) {
        const img = `<img src="${image}" loading="lazy" onerror="this.style.display='none'">`;
        out_s += img;
    }

    const siteName = balloon.site_name || url;
    if (siteName) {
        out_s += `<div class="name">${siteName}</div>`;
    }

    out_s += '</div>';

    const title = balloon.title;
    const summary = balloon.summary;
    if (title || summary) {
        out_s += '<div class="app_footer">';

        if (title) {
            out_s += `<div class="caption"><xmp>${title}</xmp></div>`;
        }

        if (summary) {
            out_s += `<div class="subcaption"><xmp>${summary}</xmp></div>`;
        }

        out_s += '</div>';
    }

    if (url) {
        out_s += '</a>';
    }

    return out_s;
}

async function formatMusic(self: HTML, balloon: MusicMessage, _: Message): Promise<string> {
    let out_s = '';

    out_s += '<div class="app_header">';

    if (balloon.track_name) {
        out_s += `<div class="name">${balloon.track_name}</div>`;
    }

    out_s += '</div>';
  
    return out_s;
}

async function formatReaction(msg: Message): Promise<string> {
    switch (msg.variant()) {
        case Variant.Reaction(_, added, reaction):
            if (!added) {
                return '';
            }
            return `<span class="reaction"><b>${reaction}</b> by ${this.config.who(msg.handle_id, msg.is_from_me)}</span>`;
        case Variant.Sticker(_):
            let paths = await Attachment.from_message(this.config.db, msg);
            let who = this.config.who(msg.handle_id, msg.is_from_me);

            return paths
                .shift()
                .flatMap(async (sticker) => this.formatAttachment(sticker, msg))
                .map((img) => `<${img}><span class="reaction"> from ${who}</span>`)
                .unwrap_or(
                    `<span class="reaction">Sticker from ${who} not found!</span>`
                );
        default:
            throw new Error('Unreachable code');
    }
}

async function formatAnnouncement(msg: Message): Promise<string> {
    let who = this.config.who(msg.handle_id, msg.is_from_me);
    if (who === 'Me') {
        who = this.config.options.custom_name || 'You';
    }
    const timestamp = msg.date(this.config.offset).toFormat('cccc, LLLL dd yyyy h:mm a');

    const announcement = msg.getAnnouncement();
    if (announcement) {
        const types = {
            [Announcement.NameChange]: (name) =>
                `<span class="timestamp">${timestamp}</span> ${who} named the conversation <b>${name}</b>`,
            [Announcement.PhotoChange]: () =>
                `<span class="timestamp">${timestamp}</span> ${who} changed the group photo.`,
            [Announcement.Unknown]: (num) =>
                `<span class="timestamp">${timestamp}</span> ${who} performed unknown action ${num}`,
        };

        return `\n<div class="announcement"><p>${types[announcement.type](announcement.payload)}</p></div>\n`;
    }
    return `<div class="announcement"><p>Unable to format announcement!</p></div>\n`;
}

async function formatShareplay(): Promise<string> {
    return 'SharePlay Message Ended';
}

async function writeToFile(file: Path, text: string): Promise<void> {
    try {
    await fs.appendFile(file, text);
    } catch (err) {
    console.error(`Unable to write to ${file}: ${err}`);
    }
}type Attachment = {
    url: string;
};

type CollaborationMessage = {
    appName?: string;
    bundleId?: string;
    url?: string;
    title?: string;
    get_url?: () => string;
};

type AppMessageType = {
    url?: string;
    image?: string;
    appName?: string;
    title?: string;
    subtitle?: string;
    ldtext?: string;
    caption?: string;
    subcaption?: string;
    trailing_caption?: string;
    trailing_subcaption?: string;
};

function format_audio(balloon: AppMessageType): string {
    let outS = "";

    if (balloon.image) {
        outS += `<img src="${balloon.image}">`;
    }

    if (balloon.preview) {
        outS += `<audio controls src="${balloon.preview}"> </audio>`;
    }

    outS += "</div>";

    if (balloon.url) {
        outS += `<a href="${balloon.url}">`;
    }

    if (balloon.artist || balloon.album) {
        outS += "<div class=\"app_footer\">";

        if (balloon.artist) {
            outS += `<div class="caption">${balloon.artist}</div>`;
        }

        if (balloon.album) {
            outS += `<div class="subcaption">${balloon.album}</div>`;
        }

        outS += "</div>";
    }

    if (balloon.url) {
        outS += "</a>";
    }

    return outS;
}

function format_collaboration(balloon: CollaborationMessage): string {
    let outS = "";

    outS += "<div class=\"app_header\">";

    if (balloon.appName) {
        outS += `<div class="name">${balloon.appName}</div>`;
    } else if (balloon.bundleId) {
        outS += `<div class="name">${balloon.bundleId}</div>`;
    }

    outS += "</div>";

    if (balloon.url) {
        outS += `<a href="${balloon.url}">`;
    }

    if (balloon.title || balloon.get_url()) {
        outS += "<div class=\"app_footer\">";

        if (balloon.title) {
            outS += `<div class="caption">${balloon.title}</div>`;
        }

        if (balloon.get_url) {
            const url = balloon.get_url();
            outS += `<div class="subcaption">${url}</div>`;
        }

        outS += "</div>";
    }

    if (balloon.url) {
        outS += "</a>";
    }

    return outS;
}import { IMessage } from "./interfaces/IMessage";

function normalRead() {
  // Create exporter
  const options = fakeOptions();
  const config = new Config(options);
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  message.text = "Hello world";
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  // May 17, 2022  9:30:31 PM
  message.date_delivered = 674530231992568192n;
  message.is_from_me = true;

  const actual = exporter.formatMessage(message, 0);
  const expected =
    '<div class="message">\n<div class="sent iMessage">\n<p><span class="timestamp">May 17, 2022  5:29:42 PM (Read by them after 1 hour, 49 seconds)</span>\n<span class="sender">Me</span></p>\n<hr><div class="message_part">\n<span class="bubble">Hello world</span>\n</div>\n</div>\n</div>\n';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlFromThemNormal() {
  // Create exporter
  const options = fakeOptions();
  const config = new Config(options);
  config.participants.set(999999, "Sample Contact");
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  message.text = "Hello world";
  message.handle_id = 999999;

  const actual = exporter.formatMessage(message, 0);
  const expected =
    '<div class="message">\n<div class="received">\n<p><span class="timestamp">May 17, 2022  5:29:42 PM</span>\n<span class="sender">Sample Contact</span></p>\n<hr><div class="message_part">\n<span class="bubble">Hello world</span>\n</div>\n</div>\n</div>\n';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlFromThemNormalRead() {
  // Create exporter
  const options = fakeOptions();
  const config = new Config(options);
  config.participants.set(999999, "Sample Contact");
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  message.handle_id = 999999;
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  message.text = "Hello world";
  // May 17, 2022  8:29:42 PM
  message.date_delivered = 674526582885055488n;
  // May 17, 2022  9:30:31 PM
  message.date_read = 674530231992568192n;

  const actual = exporter.formatMessage(message, 0);
  const expected =
    '<div class="message">\n<div class="received">\n<p><span class="timestamp">May 17, 2022  5:29:42 PM (Read by you after 1 hour, 49 seconds)</span>\n<span class="sender">Sample Contact</span></p>\n<hr><div class="message_part">\n<span class="bubble">Hello world</span>\n</div>\n</div>\n</div>\n';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlFromThemCustomNameRead() {
  // Create exporter
  const options = { ...fakeOptions(), customName: "Name" };
  const config = new Config(options);
  config.participants.set(999999, "Sample Contact");
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  message.handle_id = 999999;
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  message.text = "Hello world";
  // May 17, 2022  8:29:42 PM
  message.date_delivered = 674526582885055488n;
  // May 17, 2022  9:30:31 PM
  message.date_read = 674530231992568192n;

  const actual = exporter.formatMessage(message, 0);
  const expected =
    '<div class="message">\n<div class="received">\n<p><span class="timestamp">May 17, 2022  5:29:42 PM (Read by Name after 1 hour, 49 seconds)</span>\n<span class="sender">Sample Contact</span></p>\n<hr><div class="message_part">\n<span class="bubble">Hello world</span>\n</div>\n</div>\n</div>\n';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlShareplay() {
  // Create exporter
  const options = fakeOptions();
  const config = new Config(options);
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  exports.item_type = 6;

  const actual = exporter.formatMessage(message, 0);
  const expected =
    '<div class="message">\n<div class="received">\n<p><span class="timestamp">May 17, 2022  5:29:42 PM</span>\n<span class="sender">Me</span></p>\n<span class="shareplay">SharePlay Message Ended</span>\n</div>\n</div>\n';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlAnnouncement() {
  // Create exporter
  const options = fakeOptions();
  const config = new Config(options);
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  message.group_title = "Hello world";

  const actual = exporter.formatAnnouncement(message);
  const expected =
    '\n<div class ="announcement"><p><span class="timestamp">May 17, 2022  5:29:42 PM</span> You named the conversation <b>Hello world</b></p></div>\n';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlAnnouncementCustomName() {
  // Create exporter
  const options = { ...fakeOptions(), customName: "Name" };
  const config = new Config(options);
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  message.group_title = "Hello world";

  const actual = exporter.formatAnnouncement(message);
  const expected =
    '\n<div class ="announcement"><p><span class="timestamp">May 17, 2022  5:29:42 PM</span> Name named the conversation <b>Hello world</b></p></div>\n';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlReactionName() {
  // Create exporter
  const options = fakeOptions();
  const config = new Config(options);
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  message.associated_message_type = 2000;
  message.associated_message_guid = "fake_guid";

  const actual = exporter.formatReaction(message);
  const expected = '<span class="reaction"><b>Loved</b> by Me</span>';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}

function canFormatHtmlReactionThem() {
  // Create exporter
  const options = fakeOptions();
  const config = new Config(options);
  config.participants.set(999999, "Sample Contact");
  const exporter = new HTML(config);

  const message: IMessage = createBlankMessage();
  // May 17, 2022  8:29:42 PM
  message.date = 674526582885055488n;
  message.associated_message_type = 2000;
  message.associated_message_guid = "fake_guid";
  message.handle_id = 999999;

  const actual = exporter.formatReaction(message);
  const expected =
    '<span class="reaction"><b>Loved</b> by Sample Contact</span>';

  if (actual !== expected) {
    throw new Error("Test failed");
  }
}import { assert } from "chai";

class HtmlMessageExporter {
  private static classToTag = {
    app_footer: "div",
    caption: "div",
    subcaption: "div",
    trailing_caption: "div",
    trailing_subcaption: "div",
  };

  public format(
    classAttribute: string,
    textContent: string,
    className: string
  ): string {
    const tag = HtmlMessageExporter.classToTag[classAttribute] || "div";
    return `<${tag} class="${className}">${textContent}</${tag}>`;
  }
}

describe("HtmlMessageExporter", () => {
  const exporter = new HtmlMessageExporter();

  it("should format html strings correctly", () => {
    const actual =
      '<a href="https://www.url.com" class="url"><div class="app_footer"><div class="caption">caption</div><div class="subcaption">subcaption</div><div class="trailing_caption">trailing_caption</div><div class="trailing_subcaption">trailing_subcaption</div></div></a>';
    const expected =
      '<a href="https://www.url.com" class="url">' +
      exporter.format("app_footer", "", "app_footer") +
      exporter.format("caption", "caption", "caption") +
      exporter.format("subcaption", "subcaption", "subcaption") +
      exporter.format("trailing_caption", "trailing_caption", "trailing_caption") +
      exporter.format("trailing_subcaption", "trailing_subcaption", "trailing_subcaption") +
      '</div></a>';

    assert.equal(expected, actual);
  });
});