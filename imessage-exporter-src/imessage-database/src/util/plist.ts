import plist from "plist";
import { PlistParseError } from "../error/plist";

export function parsePlist(plistValue: plist.Value): Result<plist.Value, PlistParseError> {
  if (plistValue == undefined || typeof plistValue !== "object" || plistValue === null) {
    return new PlistParseError("InvalidType", "body", "dictionary");
  }
  const body = plistValue as plist.Dictionary;
  const objects = extractArrayKey(body, "$objects");

  const root = extractUidKey(extractDictionary(body, "$top"), "root");

  return followUid(objects, root, undefined, undefined);
}

function followUid(
  objects: plist.Value[],
  root: number,
  parent: string | undefined,
  item: plist.Value | undefined,
): Result<plist.Value, PlistParseError> {
  item = item ?? objects[root];
  if (!item) {
    return new PlistParseError("NoValueAtIndex", root);
  }

  if (plist.Array.isArray(item)) {
    const array = item.map((arrayItem) => {
      const uid = plist.UID.from(arrayItem);
      return uid ? followUid(objects, uid.get(), parent, undefined) : arrayItem;
    });
    return array;
  } else if (plist.Dictionary.isDictionary(item)) {
    const dictionary: plist.Dictionary = {};
    const itemDict = item as plist.Dictionary;

    const relative = itemDict["NS.relative"];
    const uid = plist.UID.from(relative);
    if (uid && parent) {
      dictionary[parent] = followUid(objects, uid.get(), parent, undefined);
    } else {
      const keys = extractArrayKey(itemDict, "NS.keys");
      const values = extractArrayKey(itemDict, "NS.objects");

      if (keys.length !== values.length) {
        return new PlistParseError("InvalidDictionarySize", keys.length, values.length);
      }

      for (let idx = 0; idx < keys.length; idx++) {
        const keyIndex = extractUidIdx(keys, idx);
        const valueIndex = extractUidIdx(values, idx);
        const key = extractStringIdx(objects, keyIndex);

        const value = followUid(objects, valueIndex, key, undefined);
        dictionary[key] = value;
      }
    }
    return dictionary;
  } else if (plist.UID.isUid(item)) {
    return followUid(objects, item.get(), undefined, undefined);
  } else {
    return item;
  }
}

function extractDictionary(
  body: plist.Dictionary,
  key: string,
): Result<plist.Dictionary, PlistParseError> {
  const value = body[key];
  if (value == undefined || typeof value !== "object" || value === null) {
    return new PlistParseError("InvalidType", key, "dictionary");
  }
  return value as plist.Dictionary;
}

function extractArrayKey(
  body: plist.Dictionary,
  key: string,
): Result<plist.Value[], PlistParseError> {
  const value = body[key];
  if (!Array.isArray(value)) {
    return new PlistParseError("InvalidType", key, "array");
  }
  return value as plist.Value[];
}

function extractUidKey(body: plist.Dictionary, key: string): Result<number, PlistParseError> {
  const value = body[key];
  const uid = plist.UID.from(value);
  if (!uid) {
    return new PlistParseError("InvalidType", key, "uid");
  }
  return uid.get();
}

function extractUidIdx(body: plist.Value[], idx: number): Result<number, PlistParseError> {
  const value = body[idx];
  if (!value) {
    return new PlistParseError("NoValueAtIndex", idx);
  }
  const uid = plist.UID.from(value);
  if (!uid) {
    return new PlistParseError("InvalidTypeIndex", idx, "uid");
  }
  return uid.get();
}

function extractStringIdx(body: plist.Value[], idx: number): Result<string, PlistParseError> {
  const value = body[idx];
  if (!value) {
    return new PlistParseError("NoValueAtIndex", idx);
  }
  const str = plist.String.from(value);
  if (!str) {
    return new PlistParseError("InvalidTypeIndex", idx, "string");
  }
  return str;
}