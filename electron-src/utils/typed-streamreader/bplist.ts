import { parseBuffer } from "bplist-universal";
import { Unarchiver } from "./archiver";

export class BPlistReader {
  data: Buffer;
  constructor(data: Buffer) {
    this.data = data;
  }
  private nameMap: { [key: string]: string } = {
    ec: "editedContent",
    ep: "editedParts",
    rp: "retractedParts",
    euh: "editingUserHandle",
    bcg: "backwardsCompatibilityGuid",
    d: "date",
    t: "text",
    otr: "originalTextRange",
    amc: "associatedMessageContent",
    ams: "associatedMessageSummary",
  };
  private process(data: any): any {
    if (Array.isArray(data)) {
      const arr = [];
      for (const el of data) {
        arr.push(this.process(el));
      }
      return arr;
    } else if (data == null) {
      return data;
    } else if (data instanceof Buffer) {
      try {
        const decoded = Unarchiver.open(data).decodeAll();
        if (decoded.length == 1) {
          return decoded[0];
        }
        return decoded;
      } catch (e) {
        return data;
      }
    } else if (typeof data == "object") {
      const keys = Object.keys(data);
      if ("0" in data && !("1" in data)) {
        return this.process(data["0"]);
      }
      // ranges
      if ("lo" in data && "le" in data && keys.length == 2) {
        return [data.lo, data.le];
      }
      for (const key of keys) {
        if (key in this.nameMap) {
          data[this.nameMap[key]] = data[key];
          delete data[key];
          data[this.nameMap[key]] = this.process(data[this.nameMap[key]]);
        } else {
          data[key] = this.process(data[key]);
        }
      }
      return data;
    }
    return data;
  }
  read() {
    const data = parseBuffer(this.data);
    this.process(data);
    return data;
  }
}
