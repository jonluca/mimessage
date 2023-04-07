import type { CClass } from "../archiver";
import { Unarchiver } from "../archiver";
import { archivedClass, KnownArchivedObject } from "./known_types";

@archivedClass("NSObject")
export class NSObject extends KnownArchivedObject {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSObject {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    return new NSObject();
  }
}

@archivedClass("NSData")
export class NSData extends NSObject {
  //TODO
  data: Buffer;
  constructor(data?: any) {
    super();
    this.data = data!;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSData {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    return new NSData(Buffer.from(unarchiver.decodeDataObject()));
  }
}

@archivedClass("NSMutableData")
export class NSMutableData extends NSData {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSMutableData {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    return new NSMutableData(unarchiver.decodeDataObject());
  }
}

@archivedClass("NSDate")
export class NSDate extends NSObject {
  static ABSOLUTE_REFERENCE_DATA = Date.UTC(2001, 1, 1);
  absoluteReferenceDateOffset: number;
  get value(): Date {
    return new Date(NSDate.ABSOLUTE_REFERENCE_DATA + 1000 * this.absoluteReferenceDateOffset);
  }
  constructor(absoluteReferenceDateOffset?: number) {
    super();
    this.absoluteReferenceDateOffset = absoluteReferenceDateOffset!;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSDate {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    return new NSDate(unarchiver.decodeValueOfType("d"));
  }
}

@archivedClass("NSString")
export class NSString extends NSObject {
  string: string;
  constructor(value?: string) {
    super();
    this.string = value!;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSString {
    if (archivedClass.version != 1) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    return new NSString(unarchiver.decodeValueOfType("+").toString("utf8"));
  }
}

@archivedClass("NSMutableString")
export class NSMutableString extends NSString {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSMutableString {
    if (archivedClass.version != 1) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    return new NSMutableString(unarchiver.decodeValueOfType("+").toString("utf8"));
  }
}

@archivedClass("NSAttributedString")
export class NSAttributedString extends NSString {
  runs: NSAttribute[];
  constructor(value?: string, runs?: NSAttribute[]) {
    super();
    this.string = value!;
    this.runs = runs!;
  }
  protected static readString(unarchiver: Unarchiver) {
    return unarchiver.decodeTypedValues().values[0].string;
  }
  protected static readRange(unarchiver: Unarchiver) {
    const range = unarchiver.decodeTypedValues();
    return {
      reference: range.values[0],
      length: range.values[1],
    };
  }
  protected static readAttributeValue(unarchiver: Unarchiver) {
    const dict = unarchiver.decodeTypedValues().values[0].contents;
    const attributeValue: NSAttributeValue = {};
    for (const [key, value] of dict.entries()) {
      if (value instanceof NSData) {
        if (unarchiver.binaryDecoding != Unarchiver.BinaryDecoding.none) {
          const data = value.data;
          try {
            const decoded = Unarchiver.open(data).decodeAll();
            if (decoded.length == 1) {
              attributeValue[key.string] = decoded[0];
            } else {
              attributeValue[key.string] = decoded;
            }
          } catch (e) {
            if (unarchiver.binaryDecoding == Unarchiver.BinaryDecoding.all) {
              attributeValue[key.string] = data;
            }
          }
        }
      } else if (value instanceof NSString) {
        attributeValue[key.string] = value.string;
      } else {
        attributeValue[key.string] = value.value;
      }
    }
    return attributeValue;
  }
  protected static readAttributes(unarchiver: Unarchiver, length: number) {
    const runs: NSAttribute[] = [];
    let index = 0;
    const sharedAttributeValues: { [key: number]: NSAttributeValue } = {};
    while (index < length) {
      const range = this.readRange(unarchiver);

      if (!(range.reference in sharedAttributeValues)) {
        sharedAttributeValues[range.reference] = this.readAttributeValue(unarchiver);
      }
      const attributeValue = sharedAttributeValues[range.reference];

      runs.push({
        range: [index, range.length],
        attributes: attributeValue,
      });
      index += range.length;
    }

    return runs;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSAttributedString {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const value = this.readString(unarchiver);
    return new NSAttributedString(value, this.readAttributes(unarchiver, value.length));
  }
}

@archivedClass("NSMutableAttributedString")
export class NSMutableAttributedString extends NSAttributedString {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSMutableAttributedString {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const value = this.readString(unarchiver);
    return new NSMutableAttributedString(value, this.readAttributes(unarchiver, value.length));
  }
}

interface NSAttributeValue {
  [key: string]: any;
}

interface NSAttribute {
  range: number[];
  attributes: NSAttributeValue;
}

@archivedClass("NSValue")
export class NSValue extends NSObject {
  typeEncoding: string;
  value: any;
  constructor(typeEncoding?: string, value?: any) {
    super();
    this.typeEncoding = typeEncoding!;
    this.value = value!;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSValue {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const typeEncoding = unarchiver.decodeValueOfType("*");
    const value = unarchiver.decodeValueOfType(typeEncoding);
    return new NSValue(typeEncoding, value);
  }
}

@archivedClass("NSNumber")
export class NSNumber extends NSValue {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSNumber {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const typeEncoding = unarchiver.decodeValueOfType("*");
    const value = unarchiver.decodeValueOfType(typeEncoding);
    return new NSNumber(typeEncoding, value);
  }
}

@archivedClass("NSArray")
export class NSArray<T> extends NSObject {
  elements: T[];
  constructor(elements?: T[]) {
    super();
    this.elements = elements!;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSArray<any> {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const count = unarchiver.decodeValueOfType("i");
    if (count < 0) {
      throw new EvalError(`NSArray element count cannot be negative: ${count}`);
    }
    const elements = [];
    for (let i = 0; i < count; i++) {
      elements.push(unarchiver.decodeValueOfType("@"));
    }
    return new NSArray(elements);
  }
}

@archivedClass("NSMutableArray")
export class NSMutableArray<T> extends NSArray<T> {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSMutableArray<any> {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const count = unarchiver.decodeValueOfType("i");
    if (count < 0) {
      throw new EvalError(`NSMutableArray element count cannot be negative: ${count}`);
    }
    const elements = [];
    for (let i = 0; i < count; i++) {
      elements.push(unarchiver.decodeValueOfType("@"));
    }
    return new NSMutableArray(elements);
  }
}

@archivedClass("NSSet")
export class NSSet<T> extends NSObject {
  elements: T[];
  constructor(elements?: T[]) {
    super();
    this.elements = elements!;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSSet<any> {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const count = unarchiver.decodeValueOfType("I");
    const elements = [];
    for (let i = 0; i < count; i++) {
      elements.push(unarchiver.decodeValueOfType("@"));
    }
    return new NSSet(elements);
  }
}

@archivedClass("NSMutableSet")
export class NSMutableSet<T> extends NSSet<T> {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSMutableSet<any> {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const count = unarchiver.decodeValueOfType("I");
    const elements = [];
    for (let i = 0; i < count; i++) {
      elements.push(unarchiver.decodeValueOfType("@"));
    }
    return new NSMutableSet(elements);
  }
}

@archivedClass("NSDictionary")
export class NSDictionary<K, V> extends NSObject {
  contents: Map<K, V>;
  constructor(contents?: Map<K, V>) {
    super();
    this.contents = contents!;
  }
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSDictionary<any, any> {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const count = unarchiver.decodeValueOfType("i");
    if (count < 0) {
      throw new EvalError(`NSDictionary element count cannot be negative: ${count}`);
    }
    const contents = new Map();
    for (let i = 0; i < count; i++) {
      const key = unarchiver.decodeValueOfType("@");
      const value = unarchiver.decodeValueOfType("@");
      contents.set(key, value);
    }
    return new NSDictionary(contents);
  }
}

@archivedClass("NSMutableDictionary")
export class NSMutableDictionary<K, V> extends NSDictionary<K, V> {
  static override initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): NSMutableDictionary<any, any> {
    if (archivedClass.version != 0) {
      throw new EvalError(`Unsupported version: ${archivedClass.version}`);
    }
    const count = unarchiver.decodeValueOfType("i");
    if (count < 0) {
      throw new EvalError(`NSMutableDictionary element count cannot be negative: ${count}`);
    }
    const contents = new Map();
    for (let i = 0; i < count; i++) {
      const key = unarchiver.decodeValueOfType("@");
      const value = unarchiver.decodeValueOfType("@");
      contents.set(key, value);
    }
    return new NSMutableDictionary(contents);
  }
}
