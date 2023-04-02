import { min } from "lodash";
import { existsSync, mkdirSync } from "fs";
import * as sqlite3 from "sqlite3";
import { open } from "sqlite";

import { Converter } from "./converter";
import { Options } from "./options";
import { sanitize_filename } from "./sanitizers";
import * as Attachment from "../tables/attachment";
import * as Chat from "../tables/chat";
import * as Handle from "../tables/handle";
import * as Message from "../tables/messages";
import { get_connection } from "../tables/table";
import { ATTACHMENTS_DIR, MAX_LENGTH, ME, ORPHANED, UNKNOWN } from "../tables/table";
import { get_offset } from "../util/dates";
import { Exporter, HTML, TXT } from "..";

interface Config {
  chatrooms: Map<number, Chat>;
  real_chatrooms: Map<number, number>;
  chatroom_participants: Map<number, Set<number>>;
  participants: Map<number, string>;
  real_participants: Map<number, number>;
  reactions: Map<string, Map<number, Message[]>>;
  options: Options;
  offset: number;
  // SQLite connection
  db: any;
  converter: Converter | null;
}

function conversation(config: Config, chat_id: number | null): [Chat, number] | null {
  if (chat_id === null) {
    return null;
  }

  const chatroom = config.chatrooms.get(chat_id);
  if (!chatroom) {
    console.error(`Chat ID ${chat_id} does not exist in chat table!`);
    return null;
  }

  const real_id = config.real_chatrooms.get(chat_id);
  if (!real_id) {
    return null;
  }

  return [chatroom, real_id];
}

function attachment_path(config: Config): string {
  return `${config.options.export_path}/${ATTACHMENTS_DIR}`;
}

function conversation_attachment_path(config: Config, chat_id: number | null): string {
  if (chat_id === null) {
    return ORPHANED;
  }

  const real_id = config.real_chatrooms.get(chat_id);
  if (!real_id) {
    return ORPHANED;
  }

  return real_id.toString();
}

function filename(config: Config, chatroom: Chat): string {
  const displayName = chatroom.display_name();
  let filename: string;

  if (displayName !== null) {
    filename = `${displayName.substr(0, min([MAX_LENGTH, displayName.length]))} - ${chatroom.rowid}`;
  } else {
    const participants = config.chatroom_participants.get(chatroom.rowid);
    if (participants) {
      filename = filename_from_participants(config, participants);
    } else {
      console.error(`Found error: message chat ID ${chatroom.rowid} has no members!`);
      filename = chatroom.chat_identifier;
    }
  }

  return sanitize_filename(filename);
}

function filename_from_participants(config: Config, participants: Set<number>): string {
  let added = 0;
  let out_s = "";

  for (const participant_id of participants) {
    const participant = who(config, participant_id, false);
    if (participant.length + out_s.length < MAX_LENGTH) {
      if (out_s !== "") {
        out_s += ", ";
      }
      out_s += participant;
      added += 1;
    } else {
      const extra = `, and ${participants.size - added} others`;
      const spaceRemaining = extra.length + out_s.length;
      if (spaceRemaining >= MAX_LENGTH) {
        out_s = out_s.slice(0, MAX_LENGTH - extra.length) + extra;
      } else if (out_s === "") {
        out_s = participant.substr(0, MAX_LENGTH);
      } else {
        out_s += extra;
      }
      break;
    }
  }

  return out_s;
}

async function newConfig(options: Options): Promise<Config | Error> {
  try {
    const db = await open({
      filename: options.db_path,
      driver: sqlite3.Database,
    });

    console.error("Building cache...");
    console.error("[1/4] Caching chats...");
    const chatrooms = await Chat.cache(db);
    console.error("[2/4] Caching chatrooms...");
    const chatroom_participants = await Chat.cache(db);
    console.error("[3/4] Caching participants...");
    const participants = await Handle.cache(db);
    console.error("[4/4] Caching reactions...");
    const reactions = await Message.cache(db);
    console.error("Cache built!");

    return {
      chatrooms: new Map(chatrooms.map((chat) => [chat.rowid, chat])),
      real_chatrooms: Chat.dedupe(chatroom_participants),
      chatroom_participants: Chat.toMap(chatroom_participants),
      participants: new Map(participants.map((participant) => [participant.rowid, participant])),
      real_participants: Handle.dedupe(participants),
      reactions: Message.toMap(reactions),
      options,
      offset: get_offset(),
      db,
      converter: Converter.determine(),
    };
  } catch (error) {
    return new Error("DatabaseError");
  }
}

function run_diagnostic(config: Config): void {
  console.log("\niMessage Database Diagnostics\n");

  // Run all the diagnostic functions from tables
  Handle.run_diagnostic(config.db);
  Message.run_diagnostic(config.db);
  Attachment.run_diagnostic(config.db);
  Chat.run_diagnostic(config.db);
}

async function start(config: Config): Promise<void> {
  if (config.options.diagnostic) {
    run_diagnostic(config);
  } else if (config.options.export_type !== null) {
    if (!existsSync(config.options.export_path)) {
      mkdirSync(config.options.export_path);
    }

    if (config.options.export_type === "txt") {
      // Create exporter, pass it data we care about, then kick it off
      await TXT(config).iter_messages();
    } else if (config.options.export_type === "html") {
      if (!config.options.no_copy) {
        mkdirSync(attachment_path(config));
      }
      await HTML(config).iter_messages();
    } else {
      throw new Error("Unreachable");
    }
  }

  console.log("Done!");
}

function who(config: Config, handle_id: number, is_from_me: boolean): string {
  if (is_from_me) {
    return config.options.custom_name || ME;
  }

  const contact = config.participants.get(handle_id);
  return contact || UNKNOWN;
}

export { Config, newConfig, start, conversation, attachment_path, conversation_attachment_path, filename, who };import { fake_options, fake_app, fake_chat } from './_helpers';
import { App } from './App';

describe('app runtime tests', () => {
  test('can get filename chat display name normal', () => {
    const options = fake_options();
    const app = fake_app(options);

    // Create chat
    const chat = fake_chat();
    chat.display_name = 'Test Chat Name';

    // Get filename
    const filename = app.filename(chat);
    expect(filename).toEqual('Test Chat Name - 0');
  });

  test('can get filename chat display name short', () => {
    const options = fake_options();
    const app = fake_app(options);

    // Create chat
    const chat = fake_chat();
    chat.display_name = '���';

    // Get filename
    const filename = app.filename(chat);
    expect(filename).toEqual('��� - 0');
  });

  test('can get filename chat participants', () => {
    const options = fake_options();
    const app: App = fake_app(options) as App;

    // Create chat
    const chat = fake_chat();

    // Create participant data
    app.participants.set(10, 'Person 10');
    app.participants.set(11, 'Person 11');

    // Add participants
    const people = new Set<number>();
    people.add(10);
    people.add(11);
    app.chatroom_participants.set(chat.rowid, people);

    // Get filename
    const filename = app.filename(chat);
    expect(filename).toEqual('Person 10, Person 11');
  });

  test('can get filename chat no participants', () => {
    const options = fake_options();
    const app = fake_app(options);

    // Create chat
    const chat = fake_chat();

    // Get filename
    const filename = app.filename(chat);
    expect(filename).toEqual('Default');
  });

  test('can get who them', () => {
    const options = fake_options();
    const app = fake_app(options);

    // Create participant data
    app.participants.set(10, 'Person 10');

    // Get filename
    const who = app.who(10, false);
    expect(who).toEqual('Person 10');
  });

  test('can get who them missing', () => {
    const options = fake_options();
    const app = fake_app(options);

    // Get filename
    const who = app.who(10, false);
    expect(who).toEqual('Unknown');
  });

  test('can get who me', () => {
    const options = fake_options();
    const app = fake_app(options);

    // Get filename
    const who = app.who(0, true);
    expect(who).toEqual('Me');
  });

  test('can get who me custom', () => {
    const options = fake_options();
    options.custom_name = 'Name';
    const app = fake_app(options);

    // Get filename
    const who = app.who(0, true);
    expect(who).toEqual('Name');
  });

  test('can get chat valid', () => {
    const options = fake_options();
    const app: App = fake_app(options) as App;

    // Create chat
    const chat = fake_chat();
    app.chatrooms.set(chat.rowid, chat);
    app.real_chatrooms.set(0, 0);

    // Get filename
    const [, id] = app.conversation(0);
    expect(id).toEqual(0);
  });

  test('can get chat invalid', () => {
    const options = fake_options();
    const app: App = fake_app(options) as App;

    // Create chat
    const chat = fake_chat();
    app.chatrooms.set(chat.rowid, chat);
    app.real_chatrooms.set(0, 0);

    // Get filename
    const room = app.conversation(1);
    expect(room).toBe(undefined);
  });

  test('can get chat none', () => {
    const options = fake_options();
    const app: App = fake_app(options) as App;

    // Create chat
    const chat = fake_chat();
    app.chatrooms.set(chat.rowid, chat);
    app.real_chatrooms.set(0, 0);

    // Get filename
    const room = app.conversation(null);
    expect(room).toBe(undefined);
  });

  test('can get valid attachment sub dir', () => {
    const options = fake_options();
    const app: App = fake_app(options) as App;

    // Create chatroom ID
    app.real_chatrooms.set(0, 0);

    // Get subdirectory
    const sub_dir = app.conversation_attachment_path(0);
    expect(sub_dir).toEqual('0');
  });

  test('can get invalid attachment sub dir', () => {
    const options = fake_options();
    const app: App = fake_app(options) as App;

    // Create chatroom ID
    app.real_chatrooms.set(0, 0);

    // Get subdirectory
    const sub_dir = app.conversation_attachment_path(1);
    expect(sub_dir).toEqual('orphaned');
  });

  test('can get missing attachment sub dir', () => {
    const options = fake_options();
    const app: App = fake_app(options) as App;

    // Create chatroom ID
    app.real_chatrooms.set(0, 0);

    // Get subdirectory
    const sub_dir = app.conversation_attachment_path(null);
    expect(sub_dir).toEqual('orphaned');
  });
});