import { TypedStreamReader, Unarchiver } from "./typed-streamreader";
import { BPlistReader } from "./typed-streamreader/bplist";

export const decodeMessageBuffer = async (buffer: Buffer | Uint8Array | undefined) => {
  if (buffer instanceof Uint8Array) {
    buffer = Buffer.from(buffer);
  }
  if (buffer instanceof Buffer) {
    try {
      if (buffer.subarray(0, 6).toString() === "bplist") {
        const reader = new BPlistReader(buffer);
        const parsed = reader.read();
        return parsed;
      }

      const read = new TypedStreamReader(buffer);
      const unarchiver = new Unarchiver(read);
      return unarchiver.decodeAll();
    } catch (e) {
      console.error(e);
      // ignore
    }
  }

  return buffer;
};
