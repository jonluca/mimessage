import { Value } from "plist";
import {
  getBoolFromDict,
  getStringFromDict,
  getStringFromNestedDict,
} from "../util/plist";
import { CollaborationMessage } from "./collaboration";
import { MusicMessage } from "./music";
import { BalloonProvider, URLOverride } from "./variants";

export interface URLMessage {
  title: string | null;
  summary: string | null;
  url: string | null;
  original_url: string | null;
  item_type: string | null;
  images: string[];
  icons: string[];
  site_name: string | null;
  placeholder: boolean;
}

export class URLMessageImpl implements BalloonProvider<URLMessage> {
  fromMap(payload: Value): URLMessage | Error {
    const urlMetadata = this.getBody(payload);
    if (urlMetadata instanceof Error) {
      return urlMetadata;
    }
    return {
      title: getStringFromDict(urlMetadata, "title"),
      summary: getStringFromDict(urlMetadata, "summary"),
      url: getStringFromNestedDict(urlMetadata, "URL"),
      original_url: getStringFromNestedDict(urlMetadata, "originalURL"),
      item_type: getStringFromDict(urlMetadata, "itemType"),
      images: this.getArrayFromNestedDict(urlMetadata, "images") ?? [],
      icons: this.getArrayFromNestedDict(urlMetadata, "icons") ?? [],
      site_name: getStringFromDict(urlMetadata, "siteName"),
      placeholder:
        getBoolFromDict(urlMetadata, "richLinkIsPlaceholder") ?? false,
    };
  }

  static getUrlMessageOverride(
    payload: Value
  ): URLOverride | Error {
    const urlMessageImpl = new URLMessageImpl();
    const collaborationMessage = CollaborationMessage.fromMap(payload);
    if (!(collaborationMessage instanceof Error)) {
      return URLOverride.Collaboration(collaborationMessage);
    }
    const musicMessage = MusicMessage.fromMap(payload);
    if (!(musicMessage instanceof Error)) {
      return URLOverride.AppleMusic(musicMessage);
    }
    const urlMessage = urlMessageImpl.fromMap(payload);
    if (!(urlMessage instanceof Error)) {
      return URLOverride.Normal(urlMessage);
    }
    return new Error("NoPayload");
  }

  private getBody(payload: Value): Record<string, any> | Error {
    const rootDict = payload.asDictionary();
    if (!rootDict) {
      return new Error("InvalidType: root dictionary");
    }
    const meta = rootDict["richLinkMetadata"] ?? rootDict["metadata"];
    if (!meta) {
      return new Error("NoPayload");
    }
    return meta;
  }

  private getArrayFromNestedDict(
    payload: Record<string, any>,
    key: string
  ): string[] | null {
    const dict = payload[key]?.asDictionary();
    const arr = dict?.[key]?.asArray();
    if (!arr) {
      return null;
    }
    return arr.map(item => getStringFromNestedDict(item, "URL")).filter(i => i) as string[];
  }

  static getUrl(urlMessage: URLMessage): string | null {
    return urlMessage.url ?? urlMessage.original_url;
  }
}