/**
 * Find the end index of the encoding starting at index start.
 *
 * The encoding is not validated very extensively.
 * There are no guarantees what happens for invalid encodings;
 * an error may be raised,
 * or a bogus end index may be returned.
 * Callers are expected to check that the returned end index actually results in a valid encoding.
 * @param encoding
 * @param start
 */
function endOfEncoding(encoding: string, start: number) {
  if (start > encoding.length) {
    throw new EvalError(`Start index ${start} not in range(${encoding.length})`);
  }

  let parenDepth = 0;

  let i = start;
  while (i < encoding.length) {
    const c = encoding.substring(i, i + 1);
    if (["(", "[", "{"].includes(c)) {
      // Opening parenthesis of some type, wait for a corresponding closing paren.
      // This doesn't check that the parenthesis *types* match
      // (only the *number* of closing parens has to match).
      parenDepth++;
      i++;
    } else if (parenDepth > 0) {
      if ([")", "]", "}"].includes(c)) {
        parenDepth--;
      }
      i++;
      if (parenDepth == 0) {
        return i;
      }
    } else {
      return i + 1;
    }
  }

  throw new EvalError("Incomplete encoding");
}

/**
 * Split apart multiple type encodings contained in a single encoding string.
 * @param encodings
 */
export function* splitEncodings(encodings: string) {
  let start = 0;
  while (start < encodings.length) {
    const end = endOfEncoding(encodings, start);
    yield encodings.substring(start, end);
    start = end;
  }
}

export function joinEncodings(encodings: string[]) {
  return encodings.join("");
}

/**
 * Build an array type encoding from a length and an element type encoding.
 *
 * .. note::
 *
 * This function currently doesn't perform any checking on ``element_type_encoding``,
 * but such checks may be added in the future.
 * ``element_type_encoding`` should always be a valid type encoding string.
 * @param arrayEncoding
 */
export function parseArrayEncoding(arrayEncoding: string) {
  if (!arrayEncoding.startsWith("[")) {
    throw new EvalError(`Missing opening bracket in array type encoding ${arrayEncoding}`);
  }
  if (!arrayEncoding.endsWith("]")) {
    throw new EvalError(`Missing closing bracket in array type encoding ${arrayEncoding}`);
  }

  let i = 1;
  while (i < arrayEncoding.length - 1) {
    if (!["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(arrayEncoding.charAt(i))) {
      break;
    }
    i++;
  }
  const lengthString = arrayEncoding.substring(1, i);
  const elementTypeEncoding = arrayEncoding.substring(i, arrayEncoding.length - 1);

  return {
    length: parseInt(lengthString),
    elementTypeEncoding,
  };
}

export function buildArrayEncoding(length: number, elementTypeEncoding: string): string {
  if (length < 0) {
    throw new EvalError(`Array length cannot be negative: ${length}`);
  }

  return "[" + length.toString() + elementTypeEncoding + "]";
}

/**
 * Parse an array type encoding into its name and field type encodings.
 * @param structEncoding
 */
export function parseStructEncoding(structEncoding: string) {
  if (!structEncoding.startsWith("{")) {
    throw new EvalError(`Missing opening brace in struct type encoding ${structEncoding}`);
  }
  if (!structEncoding.endsWith("}")) {
    throw new EvalError(`Missing closing brace in struct type encoding ${structEncoding}`);
  }

  const end = structEncoding.indexOf("{", 1);
  const equalsPos = structEncoding.substring(0, end).indexOf("=", 1);

  let name;
  let fieldTypeEncodingString;
  if (equalsPos == -1) {
    fieldTypeEncodingString = structEncoding.substring(1, structEncoding.length - 1);
  } else {
    name = structEncoding.substring(1, equalsPos);
    fieldTypeEncodingString = structEncoding.substring(equalsPos + 1, structEncoding.length - 1);
  }

  const fieldTypeEncodings = [...splitEncodings(fieldTypeEncodingString)];
  return {
    name,
    fieldTypeEncodings,
  };
}

export function buildStructEncoding(fieldTypeEncodings: string[], name?: string) {
  const fieldTypeEncodingString = joinEncodings(fieldTypeEncodings);
  return name == null ? "{" + fieldTypeEncodingString + "}" : "{" + name + "=" + fieldTypeEncodingString + "}";
}

export function encodingMatchesExpected(actualEncoding: string, expectedEncoding: string): boolean {
  if (actualEncoding.startsWith("{") && expectedEncoding.startsWith("{")) {
    const { name: actualName, fieldTypeEncodings: actualFieldTypeEncodings } = parseStructEncoding(actualEncoding);
    const { name: expectedName, fieldTypeEncodings: expectedFieldTypeEncodings } =
      parseStructEncoding(expectedEncoding);
    return (
      (actualName == null || actualName == "?" || actualName == expectedName) &&
      allEncodingsMatchExpected(actualFieldTypeEncodings, expectedFieldTypeEncodings)
    );
  } else if (actualEncoding.startsWith("[") && expectedEncoding.startsWith("[")) {
    const { length: actualLength, elementTypeEncoding: actualElementTypeEncoding } = parseArrayEncoding(actualEncoding);
    const { length: expectedLength, elementTypeEncoding: expectedElementTypeEncoding } =
      parseArrayEncoding(expectedEncoding);
    return (
      actualLength == expectedLength && encodingMatchesExpected(actualElementTypeEncoding, expectedElementTypeEncoding)
    );
  } else {
    return actualEncoding == expectedEncoding;
  }
}

export function allEncodingsMatchExpected(actualEncodings: string[], expectedEncodings: string[]) {
  if (actualEncodings.length != expectedEncodings.length) {
    return false;
  }
  for (let i = 0; i < actualEncodings.length; i++) {
    if (!encodingMatchesExpected(actualEncodings[i], expectedEncodings[i])) {
      return false;
    }
  }
  return true;
}
