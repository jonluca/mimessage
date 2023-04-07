import type { CClass, Unarchiver } from "../archiver";
import { buildStructEncoding } from "../encodings";

export abstract class KnownArchivedObject {
  static archivedName: string;
  static consumeEnd: boolean;
  static initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): KnownArchivedObject {
    throw new Error("Method not implemented");
  }
}

export type KnownArchivedObjectDerived = { new (): KnownArchivedObject } & typeof KnownArchivedObject;
export const archivedClassesByName = new Map<string, KnownArchivedObjectDerived>();

export function archivedClass(archivedName: string) {
  return (target: KnownArchivedObjectDerived) => {
    target.archivedName = archivedName;
    target.consumeEnd = false;
    archivedClassesByName.set(archivedName, target);
  };
}

export abstract class KnownStruct {
  static structName: string;
  static fieldEncodings: string[];
  static encoding: string;
  protected constructor(fields: any[]) {
    // none
  }
}

export type KnownStructDerived = { new (fields: any[]): KnownStruct } & typeof KnownStruct;
export const structClassesByEncoding = new Map<string, KnownStructDerived>();

export function structClass(structName: string, fieldEncodings: string[]) {
  return (target: KnownStructDerived) => {
    target.structName = structName;
    target.fieldEncodings = fieldEncodings;
    target.encoding = buildStructEncoding(fieldEncodings, structName);
    structClassesByEncoding.set(target.encoding, target);
  };
}
