import { parseArrayEncoding, parseStructEncoding, splitEncodings } from "./encodings";

// This is the earliest streamer version still supported by Mac OS X.
// It is only produced by earlier versions of NeXTSTEP (unclear which).
const STREAMER_VERSION_OLD_NEXTSTEP = 3;
// This is the streamer version used by all versions of Mac OS X and later versions of NeXTSTEP.
// It is probably the last version to ever exist,
// as the typedstream format is effectively obsolete.
const STREAMER_VERSION_CURRENT = 4;

const SIGNATURE_LENGTH = "typedstream".length;

const SIGNATURE_TO_BYTE_ORDER_MAP: Record<string, "BE" | "LE"> = {
  typedstream: "BE",
  streamtyped: "LE",
};

// These values are taken from the NXSYSTEMVERSION constants
// from typedstream.h from an early (Darwin 0.1) version of the Objective-C runtime:
// https://sourceforge.net/projects/aapl-darwin/files/Darwin-0.1/objc-1.tar.gz/download
// These appear to correspond to early NeXTSTEP version numbers (0.8.x, 0.9.x).
const SYSTEM_VERSION_NEXTSTEP_082 = 82;
const SYSTEM_VERSION_NEXTSTEP_083 = 83;
const SYSTEM_VERSION_NEXTSTEP_090 = 90;
const SYSTEM_VERSION_NEXTSTEP_0900 = 900;
const SYSTEM_VERSION_NEXTSTEP_0901 = 901;
const SYSTEM_VERSION_NEXTSTEP_0905 = 905;
const SYSTEM_VERSION_NEXTSTEP_0930 = 930;
// This is the system version used by all versions of Mac OS X since at least 10.4
// (and probably earlier - if the numbering scheme is to be trusted, probably since NeXTSTEP 1.0).
const SYSTEM_VERSION_MAC_OS_X = 1000;

// In the original Darwin code,
// the term "label" is used ambiguously -
// both for the static integer constants listed below,
// and the dynamically assigned object reference numbers.
// For clarity,
// we use the following terminology:
// * A "reference number" is an integer (single-byte or multi-byte) that stands for a string or object stored earlier in the file.
// * A "tag" is one of the constant TAG_* values listed below.
// * A "head" is a single-byte value that stores either a single-byte reference number or a tag (indicating a literal string/object or a multi-byte reference number).

// Indicates an integer value, stored in 2 bytes.
const TAG_INTEGER_2 = -127;
// Indicates an integer value, stored in 4 bytes.
const TAG_INTEGER_4 = -126;
// Indicates a floating-point value, stored in 4 or 8 bytes (depending on whether it is a float or a double).
const TAG_FLOATING_POINT = -125;
// Indicates the start of a string value or an object that is stored literally and not as a backreference.
const TAG_NEW = -124;
// Indicates a nil value. Used for strings (unshared and shared), classes, and objects.
const TAG_NIL = -123;
// Indicates the end of an object.
const TAG_END_OF_OBJECT = -122;

// The lowest and highest values reserved for use as tags.
// Values outside this range are used to literally encode single-byte integers.
// Integer values that fall into the tag range must be encoded in two separate bytes using _TAG_INTEGER_2
// so that they do not conflict with the tags.
const FIRST_TAG = -128;
const LAST_TAG = -111;
function inTagRange(n?: number): boolean {
  if (n == null) {
    return false;
  }
  return n >= FIRST_TAG && n <= LAST_TAG;
}
// The first reference number to be used.
// This has been chosen to be exactly one higher than the highest tag,
// so that early reference numbers can be encoded directly in the head.
const FIRST_REFERENCE_NUMBER = LAST_TAG + 1;

/**
 * Decode a reference number (as stored in a typedstream) to a regular zero-based index.
 */
function decodeReferenceNumber(encoded: number): number {
  return encoded - FIRST_REFERENCE_NUMBER;
}

/**
 * Raised by :class:`TypedStreamReader` if the typedstream data is invalid or doesn't match the expected structure.
 */
class InvalidTypedStreamError extends Error {}

class EOFError extends Error {}

/**
 * Marks the beginning of a group of values prefixed by a type encoding string.
 */
export class BeginTypedValues {
  encodings: Array<string>;
  constructor(encodings: Array<string>) {
    this.encodings = encodings;
  }
}

/**
 * Marks the end of a group of values prefixed by a type encoding string.
 *
 * This event is provided for convenience and doesn't correspond to any data in the typedstream.
 */
export class EndTypedValues {}

/**
 * A reference to a previously read object.
 */
export class ObjectReference {
  referencedType: ObjectReference.Type;
  number: number;
  constructor(referencedType: ObjectReference.Type, number: number) {
    this.referencedType = referencedType;
    this.number = number;
  }
}

export namespace ObjectReference {
  /**
   * Describes what type of object a reference refers to.
   */
  export enum Type {
    C_STRING = "C string",
    CLASS = "class",
    OBJECT = "object",
  }
}

/**
 * A NeXTSTEP atom (NXAtom), i. e. a shared/deduplicated C string.
 *
 * In (Objective-)C on NeXTSTEP,
 * atoms are immutable C strings that have been deduplicated so that two atoms with the same content always have the same address.
 * This allows checking two atoms for equality by just comparing the pointers/addresses,
 * instead of having to compare their contents.
 * Other than that,
 * atoms behave like regular C strings.
 *
 * Mac OS X/macOS no longer supports atoms and throws an exception when attempting to decode them using ``NSUnarchiver``.
 *
 * This is a thin wrapper around a plain :class:`bytes` object.
 * The wrapper class is used to distinguish atoms from untyped bytes.
 */
export class Atom {
  contents?: Buffer;
  constructor(contents?: Buffer) {
    this.contents = contents;
  }
}

/**
 * An Objective-C selector.
 *
 * This is a thin wrapper around a plain :class:`bytes` object.
 * The wrapper class is used to distinguish selector values from untyped bytes.
 */
export class Selector {
  name?: Buffer;
  constructor(name?: Buffer) {
    this.name = name;
  }
}

/**
 * Information about a C string as it is stored in a typedstream.
 *
 * This is a thin wrapper around a plain :class:`bytes` object.
 * The wrapper class is used to distinguish typed C string values from untyped bytes.
 */
export class CString {
  contents: Buffer;
  constructor(contents: Buffer) {
    this.contents = contents;
  }
}

/**
 * Information about a class (name and version),
 * stored literally in a chain of superclasses in a typedstream.
 *
 * A class in a typedstream can be stored literally, as a reference, or be ``Nil``.
 * A literally stored class is always followed by information about its superclass.
 * If the superclass information is also stored literally,
 * it is again followed by information about its superclass.
 * This chain continues until a class is reached that has been stored before
 * (in which case it is stored as a reference)
 * or a root class is reached
 * (in which case the superclass is ``Nil``).
 *
 * The beginning and end of such a chain of superclasses are not marked explicitly in a typedstream,
 * and no events are generated when a superclass chain begins or ends.
 * A superclass chain begins implicitly when a literally stored class is encountered
 * (if no chain is already in progress),
 * and the chain ends after the first non-literal (i. e. reference or ``Nil``) class.
 */
export class SingleClass {
  name: string;
  version: number;
  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }
}

/**
 * Marks the beginning of a literally stored object.
 *
 * This event is followed by information about the object's class,
 * stored as a chain of class information (see :class:`SingleClass`).
 * This class chain is followed by an arbitrary number of type-prefixed value groups,
 * which represent the object's contents.
 * The object ends when an :class:`EndObject` is encountered where the next value group would start.
 */
export class BeginObject {}

/**
 * Marks the end of a literally stored object.
 */
export class EndObject {}

/**
 * Represents an array of bytes (signed or unsigned char).
 *
 * For performance and simplicity,
 * such arrays are read all at once and represented as a single event,
 * instead of generating one event per element as for other array element types.
 */
export class ByteArray {
  elementEncoding: string;
  data: Buffer;
  constructor(elementEncoding: string, data: Buffer) {
    this.elementEncoding = elementEncoding;
    this.data = data;
  }
}

/**
 * Marks the beginning of an array.
 *
 * This event is provided for convenience and doesn't directly correspond to data in the typedstream.
 * The array length and element type information provided in this event actually comes from the arrays's type encoding.
 *
 * This event is followed by the element values,
 * which are not explicitly type-prefixed,
 * as they all have the type specified in the array type encoding.
 * The end of the array is not marked in the typedstream data,
 * as it can be determined based on the length and element type,
 * but for convenience,
 * an :class:`EndArray` element is generated after the last array element.
 *
 * This event is *not* generated for arrays of bytes (signed or unsigned char) -
 * such arrays are represented as single :class:`ByteArray` events instead.
 */
export class BeginArray {
  elementEncoding: string;
  length: number;
  constructor(elementEncoding: string, length: number) {
    this.elementEncoding = elementEncoding;
    this.length = length;
  }
}

/**
 * Marks the end of an array.
 *
 * This event is provided for convenience and doesn't correspond to any data in the typedstream.
 */
export class EndArray {}

/**
 * Marks the beginning of a struct.
 *
 * This event is provided for convenience and doesn't directly correspond to data in the typedstream.
 * The struct name and field type information provided in this event actually comes from the struct's type encoding.
 *
 * This event is followed by the field values,
 * which are not explicitly type-prefixed (unlike in objects),
 * as their types are specified in the struct type encoding.
 * The end of the struct is not marked in the typedstream data,
 * as it can be determined based on the type information,
 * but for convenience,
 * an :class:`EndStruct` element is generated after the last struct field.
 */
export class BeginStruct {
  name?: string;
  fieldEncodings: Array<string>;
  constructor(fieldEncodings: Array<string>, name?: string) {
    this.name = name;
    this.fieldEncodings = fieldEncodings;
  }
}

/**
 * Marks the end of a struct.
 *
 * This event is provided for convenience and doesn't correspond to any data in the typedstream.
 */
export class EndStruct {}

export type ReadEvent =
  | BeginTypedValues
  | EndTypedValues
  | number
  | ObjectReference
  | CString
  | Atom
  | Selector
  | Buffer
  | SingleClass
  | BeginObject
  | EndObject
  | ByteArray
  | BeginArray
  | EndArray
  | BeginStruct
  | EndStruct
  | undefined;

/**
 * Reads typedstream data from a raw byte stream.
 */
export class TypedStreamReader implements Iterator<ReadEvent> {
  private EOF_MESSAGE = "End of typedstream reached";

  private data: Buffer;
  private pos = 0;

  sharedStringTable: Array<Buffer>;

  streamerVersion: number;
  byteOrder: "LE" | "BE";
  systemVersion: number;

  private eventsIterator: Generator<ReadEvent>;

  /**
   * Create a :class:`TypedStreamReader` that reads data from the given raw byte stream.
   *
   * @param data The raw byte stream from which to read the typedstream data.
   * By default this is ``False`` and callers are expected to close the raw stream themselves after closing the :class:`TypedStreamReader`.
   */
  constructor(data: Buffer) {
    this.data = data;

    this.sharedStringTable = [];

    // reads header
    this.streamerVersion = this.readInteger(false);
    const signatureLength = this.readInteger(false);

    if (this.streamerVersion < STREAMER_VERSION_OLD_NEXTSTEP || this.streamerVersion > STREAMER_VERSION_CURRENT) {
      throw new InvalidTypedStreamError(`Invalid streamer version: ${this.streamerVersion}`);
    } else if (this.streamerVersion == STREAMER_VERSION_OLD_NEXTSTEP) {
      throw new InvalidTypedStreamError(`Old NeXTSTEP streamer version (${this.streamerVersion}) not supported (yet?)`);
    }

    if (signatureLength != SIGNATURE_LENGTH) {
      throw new InvalidTypedStreamError(
        `The signature string must be exactly ${SIGNATURE_LENGTH} bytes long, not ${signatureLength}`,
      );
    }

    const signature = this.readExact(signatureLength).toString("ascii");
    this.byteOrder = SIGNATURE_TO_BYTE_ORDER_MAP[signature];

    this.systemVersion = this.readInteger(false);

    // read values
    this.eventsIterator = this.readAllValues();
  }

  next() {
    return this.eventsIterator.next();
  }

  [Symbol.iterator]() {
    return this.eventsIterator;
  }

  /**
   * Read byte_count bytes from the raw stream and raise an exception if too few bytes are read
   * (i. e. if EOF was hit prematurely).
   */
  private readExact(byteCount: number) {
    return this.data.subarray(this.pos, (this.pos += byteCount));
  }

  /**
   * Read a head byte.
   *
   * @param head If ``None``, the head byte is read normally from the stream.
   * Otherwise, the passed-in head byte is returned and no read is performed.
   * This parameter is provided to simplify a common pattern in this class's internal methods,
   * where methods that need to read a head byte
   * can alternatively accept an already read head byte as a parameter
   * and skip the read operation.
   * This mechanism is used to allow a limited form of lookahead for the head byte,
   * which is needed to parse string and object references and to detect end-of-object markers.
   * @return The read or passed in head byte.
   * @private
   */
  private readHeadByte(head?: number) {
    if (head == null) {
      head = this.readExact(1).readInt8();
    }
    return head;
  }

  /**
   * Read a low-level integer value.
   *
   * @param signed Whether to treat the integer as signed or unsigned.
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return The decoded integer value.
   * @private
   */
  private readInteger(signed: boolean, head?: number): number {
    head = this.readHeadByte(head);
    if (!inTagRange(head)) {
      if (signed) {
        return head;
      } else {
        return head & 0xff;
      }
    } else if (head == TAG_INTEGER_2) {
      if (this.byteOrder == "LE") {
        if (signed) {
          return this.readExact(2).readInt16LE();
        } else {
          return this.readExact(2).readUint16LE();
        }
      } else {
        if (signed) {
          return this.readExact(2).readInt16BE();
        } else {
          return this.readExact(2).readUint16BE();
        }
      }
    } else if (head == TAG_INTEGER_4) {
      if (this.byteOrder == "LE") {
        if (signed) {
          return this.readExact(2).readInt32LE();
        } else {
          return this.readExact(2).readUint32LE();
        }
      } else {
        if (signed) {
          return this.readExact(2).readInt32BE();
        } else {
          return this.readExact(2).readUint32BE();
        }
      }
    } else {
      throw new InvalidTypedStreamError(`Invalid head tag in this context: ${head} (${head & 0xff}`);
    }
  }

  /**
   * Read a low-level single-precision float value.
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return The decoded float value
   * @private
   */
  private readFloat(head?: number): number {
    head = this.readHeadByte(head);
    if (head == TAG_FLOATING_POINT) {
      if (this.byteOrder == "LE") {
        return this.readExact(4).readFloatLE();
      } else {
        return this.readExact(4).readFloatBE();
      }
    } else {
      return this.readInteger(true, head);
    }
  }

  /**
   * Read a low-level double-precision float value.
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return The decoded double value
   * @private
   */
  private readDouble(head?: number): number {
    head = this.readHeadByte(head);
    if (head == TAG_FLOATING_POINT) {
      if (this.byteOrder == "LE") {
        return this.readExact(8).readDoubleBE();
      } else {
        return this.readExact(8).readDoubleLE();
      }
    } else {
      return this.readInteger(true, head);
    }
  }

  /**
   * Read a low-level string value.
   *
   * Strings in typedstreams have no specificed encoding,
   * so the string data is returned as raw :class:`bytes`.
   * (In practice, they usually consist of printable ASCII characters.)
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return The read string data, which may be ``nil``/``None``.
   * @private
   */
  private readUnsharedString(head?: number): Buffer | undefined {
    head = this.readHeadByte(head);
    if (head == TAG_NIL) {
      return undefined;
    }
    const length = this.readInteger(false, head);
    return this.readExact(length);
  }

  /**
   * Read a low-level shared string value.
   *
   * A shared string value may either be stored literally (as an unshared string)
   * or as a reference to a previous literally stored shared string.
   * Literal shared strings are appended to the :attr:`shared_string_table` after they are read,
   * so that they can be referenced by later non-literal shared strings.
   * This happens transparently to the caller -
   * in both cases the actual string data is returned.
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return The read string data, which may be ``nil``/``None``.
   * @private
   */
  private readSharedString(head?: number): Buffer | undefined {
    head = this.readHeadByte(head);
    if (head == TAG_NIL) {
      return undefined;
    } else if (head == TAG_NEW) {
      const string = this.readUnsharedString();
      if (string == null) {
        throw new InvalidTypedStreamError("Literal shared string cannot contain a nil unshared string");
      }
      this.sharedStringTable.push(string);
      return string;
    } else {
      const referenceNumber = this.readInteger(true, head);
      const decoded = decodeReferenceNumber(referenceNumber);
      return this.sharedStringTable[decoded];
    }
  }

  /**
   * Read an object reference value.
   *
   * Despite the name,
   * object references can't just refer to objects,
   * but also to classes or C strings.
   * The type of object that a reference refers to is always clear from context
   * and is not explicitly stored in the typedstream.
   *
   * @param referencedType The type of object that the reference refers to.
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return The read object reference.
   * @private
   */
  private readObjectReference(referencedType: ObjectReference.Type, head?: number) {
    const referenceNumber = this.readInteger(true, head);
    return new ObjectReference(referencedType, decodeReferenceNumber(referenceNumber));
  }

  /**
   * Read a C string value.
   *
   * A C string value may either be stored literally
   * or as a reference to a previous literally stored C string value.
   * Literal C string values are returned as :class:`CString` objects.
   * C string values stored as references are returned as :class:`ObjectReference` objects
   * and are not automatically dereferenced.
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return The read C string value or reference, which may be ``nil``/``None``.
   * @private
   */
  private readCString(head?: number): CString | ObjectReference | undefined {
    head = this.readHeadByte(head);
    if (head == TAG_NIL) {
      return undefined;
    } else if (head == TAG_NEW) {
      const string = this.readSharedString();
      if (string == null) {
        throw new InvalidTypedStreamError("Literal C string cannot contain a nil shared string");
      }
      return new CString(string);
    } else {
      return this.readObjectReference(ObjectReference.Type.C_STRING, head);
    }
  }

  /**
   * Iteratively read a class object from the typedstream.
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return An iterable of events representing the class object.
   * See :class:`SingleClass` for information about what events are generated when and what they mean.
   * @private
   */
  private *readClass(head?: number): Generator<SingleClass | ObjectReference | undefined> {
    head = this.readHeadByte(head);
    while (head == TAG_NEW) {
      const name = this.readSharedString();
      if (name == null) {
        throw new InvalidTypedStreamError("Class name cannot be nil");
      }
      const version = this.readInteger(true);
      yield new SingleClass(name.toString("ascii"), version);
      head = this.readHeadByte();
    }

    if (head == TAG_NIL) {
      yield undefined;
    } else {
      yield this.readObjectReference(ObjectReference.Type.CLASS, head);
    }
  }

  /**
   * Iteratively read an object from the typedstream,
   * including all of its contents and the end of object marker.
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return An iterable of events representing the object.
   * See :class:`BeginObject` and :class:`EndObject` for information about what events are generated when and what they mean.
   * @private
   */
  private *readObject(head?: number): Generator<ReadEvent | undefined> {
    head = this.readHeadByte(head);
    if (head == TAG_NIL) {
      yield undefined;
    } else if (head == TAG_NEW) {
      yield new BeginObject();
      yield* this.readClass();
      let nextHead = this.readHeadByte();
      while (nextHead != TAG_END_OF_OBJECT) {
        yield* this.readTypedValues(nextHead);
        nextHead = this.readHeadByte();
      }
      yield new EndObject();
    } else {
      yield this.readObjectReference(ObjectReference.Type.OBJECT, head);
    }
  }

  /**
   * Iteratively read a single value with the type indicated by the given type encoding.
   *
   * The type encoding string must contain exactly one type
   * (although it may be a compound type like a struct or array).
   * Type encoding strings that might contain more than one value must first be split using :func:`_split_encodings`.
   *
   * @param typeEncoding
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @return An iterable of events representing the object.
   * Simple values are represented by single events,
   * but more complex values (classes, objects, arrays, structs) usually generate multiple events.
   * @private
   */
  private *readValueWithEncoding(typeEncoding: string, head?: number): Generator<ReadEvent> {
    // Unlike other integer types,
    // chars are always stored literally -
    // the usual tags do not apply.
    if (typeEncoding == "C") {
      yield this.readExact(1).readUInt8();
    } else if (typeEncoding == "c") {
      yield this.readExact(1).readInt8();
    } else if (["S", "I", "L", "Q"].includes(typeEncoding)) {
      yield this.readInteger(false, head);
    } else if (["s", "i", "l", "q"].includes(typeEncoding)) {
      yield this.readInteger(true, head);
    } else if (typeEncoding == "f") {
      yield this.readFloat(head);
    } else if (typeEncoding == "d") {
      yield this.readDouble(head);
    } else if (typeEncoding == "*") {
      yield this.readCString(head);
    } else if (typeEncoding == "%") {
      yield new Atom(this.readSharedString(head));
    } else if (typeEncoding == ":") {
      yield new Selector(this.readSharedString(head));
    } else if (typeEncoding == "+") {
      yield this.readUnsharedString(head);
    } else if (typeEncoding == "#") {
      yield* this.readClass(head);
    } else if (typeEncoding == "@") {
      yield* this.readObject(head);
    } else if (typeEncoding == "!") {
      // "!" stands for an int-sized field that should be ignored when (un)archiving.
      // The "!" *type* is stored in the typedstream when encoding and is expected to be present when decoding,
      // but no actual data is written or read.
      // Mac OS X/macOS supports encoding "!" using NSArchiver,
      // but throws an exception when trying to decode it using NSUnarchiver.
      yield undefined;
    } else if (typeEncoding.startsWith("[")) {
      const { length, elementTypeEncoding } = parseArrayEncoding(typeEncoding);

      if (["c", "C"].includes(elementTypeEncoding)) {
        // Special case for byte arrays for faster reading and a better parsed representation.
        yield new ByteArray(elementTypeEncoding, this.readExact(length));
      } else {
        yield new BeginArray(elementTypeEncoding, length);
        for (let i = 0; i < length; i++) {
          yield* this.readValueWithEncoding(elementTypeEncoding);
        }
        yield new EndArray();
      }
    } else if (typeEncoding.startsWith("{")) {
      const { name, fieldTypeEncodings } = parseStructEncoding(typeEncoding);
      yield new BeginStruct(fieldTypeEncodings, name);
      for (const fieldTypeEncoding of fieldTypeEncodings) {
        yield* this.readValueWithEncoding(fieldTypeEncoding);
      }
      yield new EndStruct();
    } else {
      throw new InvalidTypedStreamError(`Don't know how to read a value with type encoding ${typeEncoding}`);
    }
  }

  /**
   * Iteratively read the next group of typed values from the stream.
   *
   * The type encoding string is decoded to determine the type of the following values.
   *
   * @param head An already read head byte to use, or ``None`` if the head byte should be read from the stream.
   * @param endOfStreamOk Whether reaching the end of the data stream is an acceptable condition.
   * If this method is called when the end of the stream is reached,
   * an :class:`EOFError` is raised if this parameter is true,
   * and an :class:`InvalidTypedStreamError` is raised if it is false.
   * If the end of the stream is reached in the middle of reading a value
   * (not right at the beginning),
   * the exception is always an :class:`InvalidTypedStreamError`,
   * regardless of the value of this parameter.
   * @return An iterable of events representing the typed values.
   * See :class:`BeginTypedValues` and :class:`EndTypedValues` for information about what events are generated when and what they mean.
   */
  private *readTypedValues(head?: number, endOfStreamOk = false): Generator<ReadEvent> {
    try {
      head = this.readHeadByte(head);
    } catch (e) {
      const validMessages = ["Trying to access beyond buffer length", "Attempt to access memory outside buffer bounds"];
      if (e instanceof RangeError && validMessages.includes(e.message) && endOfStreamOk) {
        throw new EOFError(this.EOF_MESSAGE);
      } else {
        throw e;
      }
    }

    const encodingString = this.readSharedString(head)?.toString("ascii");
    if (encodingString == null) {
      throw new InvalidTypedStreamError("Encountered nil type encoding string");
    }

    const typeEncodings = Array.from(splitEncodings(encodingString));
    yield new BeginTypedValues(typeEncodings);
    for (const typeEncoding of typeEncodings) {
      yield* this.readValueWithEncoding(typeEncoding);
    }
    yield new EndTypedValues();
  }

  /**
   * Iteratively read all values in the typedstream.
   *
   * @return An iterable of events representing the contents of the typedstream.
   * Top-level values in a typedstream are always prefixed with a type encoding.
   * See :class:`BeginTypedValues` and :class:`EndTypedValues` for information about what events are generated when and what they mean.
   * @private
   */
  private *readAllValues(): Generator<ReadEvent> {
    while (true) {
      try {
        yield* this.readTypedValues(undefined, true);
      } catch (e) {
        if (e instanceof EOFError) {
          return;
        } else {
          throw e;
        }
      }
    }
  }
}
