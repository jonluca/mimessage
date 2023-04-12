import { TypedStreamReader, Unarchiver } from "./typed-streamreader";
import { BPlistReader } from "./typed-streamreader/bplist";

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
  } catch (e) {
    console.error(e);
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
