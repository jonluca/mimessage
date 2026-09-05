import { Unarchiver } from "./typed-streamreader/archiver";
import { BPlistReader } from "./typed-streamreader/bplist";
import { TypedStreamReader } from "./typed-streamreader/stream";
import { parseBuffer as parseBinaryPlist } from "bplist-universal";

export interface RichLinkMetadata {
  iconAttachmentIndex: number | null;
  imageAttachmentIndex: number | null;
  originalUrl: string | null;
  subtitle: string | null;
  title: string | null;
}

interface KeyedArchiveReference {
  UID: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isKeyedArchiveReference = (value: unknown): value is KeyedArchiveReference =>
  isRecord(value) && typeof value.UID === "number";

const resolveArchiveValue = (value: unknown, objects: unknown[]) => {
  let resolved = value;
  const visited = new Set<number>();
  while (isKeyedArchiveReference(resolved)) {
    if (visited.has(resolved.UID)) {
      return null;
    }
    visited.add(resolved.UID);
    resolved = objects[resolved.UID];
  }
  return resolved;
};

const resolveArchiveString = (value: unknown, objects: unknown[]) => {
  const resolved = resolveArchiveValue(value, objects);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
};

const resolveArchiveUrl = (value: unknown, objects: unknown[]) => {
  const resolved = resolveArchiveValue(value, objects);
  if (typeof resolved === "string") {
    return resolved;
  }
  if (!isRecord(resolved)) {
    return null;
  }
  return resolveArchiveString(resolved["NS.relative"], objects);
};

const resolveAttachmentIndex = (value: unknown, objects: unknown[]) => {
  const resolved = resolveArchiveValue(value, objects);
  if (!isRecord(resolved)) {
    return null;
  }
  const index = resolved.richLinkImageAttachmentSubstituteIndex;
  return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : null;
};

export const parseRichLinkMetadata = (buffer: Buffer | Uint8Array | null | undefined): RichLinkMetadata | null => {
  try {
    const payload = buffer instanceof Uint8Array && !(buffer instanceof Buffer) ? Buffer.from(buffer) : buffer;
    if (!(payload instanceof Buffer) || payload.subarray(0, 6).toString() !== "bplist") {
      return null;
    }
    const [archive] = parseBinaryPlist(payload) as unknown[];
    if (!isRecord(archive) || archive.$archiver !== "NSKeyedArchiver" || !Array.isArray(archive.$objects)) {
      return null;
    }
    const objects = archive.$objects;
    const top = archive.$top;
    if (!isRecord(top)) {
      return null;
    }
    const root = resolveArchiveValue(top.root, objects);
    if (!isRecord(root)) {
      return null;
    }
    const metadata = resolveArchiveValue(root.richLinkMetadata, objects);
    if (!isRecord(metadata)) {
      return null;
    }
    const specialization = resolveArchiveValue(metadata.specialization2, objects);
    const title = resolveArchiveString(metadata.title, objects);
    const subtitle = isRecord(specialization) ? resolveArchiveString(specialization.subtitle, objects) : null;
    const originalUrl = resolveArchiveUrl(metadata.originalURL ?? metadata.URL, objects);
    const iconAttachmentIndex = resolveAttachmentIndex(metadata.icon, objects);
    const imageAttachmentIndex = resolveAttachmentIndex(metadata.image, objects);
    if (!title && !subtitle && !originalUrl && iconAttachmentIndex === null && imageAttachmentIndex === null) {
      return null;
    }
    return {
      iconAttachmentIndex,
      imageAttachmentIndex,
      originalUrl,
      subtitle,
      title,
    };
  } catch {
    return null;
  }
};

export const decodeMessageBuffer = async (buffer: Buffer | Uint8Array | undefined) => {
  try {
    if (buffer instanceof Uint8Array) {
      buffer = Buffer.from(buffer);
    }
    if (buffer instanceof Buffer && buffer.length) {
      if (buffer.subarray(0, 6).toString() === "bplist") {
        const reader = new BPlistReader(buffer);
        const parsed = reader.read();
        return parsed;
      }

      const read = new TypedStreamReader(buffer);
      const unarchiver = new Unarchiver(read);
      return unarchiver.decodeAll();
    }
  } catch {
    // ignore
  }
  return buffer;
};

export const getTextFromBuffer = async (buffer: Buffer | Uint8Array | undefined) => {
  try {
    const parsed = await decodeMessageBuffer(buffer);
    if (parsed) {
      const string = parsed[0]?.value?.string;
      if (string) {
        return (string || "").trim().replace(/[\u{FFFC}-\u{FFFD}]/gu, "");
      }
    }
  } catch {
    //skip
  }

  return null;
};
