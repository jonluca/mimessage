import { StreamTypedError } from '../error/plist/PlistParseError';
import { BalloonProvider } from './variants/BalloonProvider';
import { parse as parseStreamTyped } from '../util/streamtyped';
import { extractBytesKey, extractDictionary, extractIntKey } from '../util/plist';
import { Value } from 'plist';

const TIMESTAMP_FACTOR = 1_000_000_000;

export class EditedMessage {
  public dates: number[];
  public texts: string[];
  public guids: (string | null)[];

  constructor() {
    this.dates = [];
    this.texts = [];
    this.guids = [];
  }

  static async fromMap(payload: Value): Promise<EditedMessage> {
    const edited = new EditedMessage();

    const plistRoot = payload.asDictionary();
    if (!plistRoot) {
      throw new Error('Invalid type for root dictionary');
    }

    if (!plistRoot.has('ec')) {
      return edited;
    }

    const editedMessages = extractDictionary(plistRoot, 'ec')?.values().next();// TODO: Fix for async iteration

    if (!editedMessages) {
      throw new Error('Missing key "ec"');
    }

    for (const [idx, message] of editedMessages.entries()) {
      const messageData = message.asDictionary();
      if (!messageData) {
        throw new Error(`Invalid type at index ${idx}: dictionary`);
      }

      const timestamp = (await extractIntKey(messageData, 'd')) * TIMESTAMP_FACTOR;

      const rawStreamTyped = await extractBytesKey(messageData, 't');
      const text = parseStreamTyped(rawStreamTyped);

      const guid = messageData.get('bcg')?.asString() || null;

      edited.dates.push(timestamp);
      edited.texts.push(text);
      edited.guids.push(guid);
    }

    return edited;
  }

  isDeleted(): boolean {
    return this.texts.length === 0;
  }

  itemAt(position: number): [number, string, string | null] | null {
    const date = this.dates[position];
    const text = this.texts[position];
    const guid = this.guids[position];

    if (date === undefined || text === undefined || guid === undefined) {
      return null;
    }

    return [date, text, guid];
  }

  items(): number {
-    return this.texts.length;
  }
}

```