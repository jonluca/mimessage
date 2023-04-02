const START_PATTERN: Uint8Array = new Uint8Array([0x0001, 0x002b]);
const END_PATTERN: Uint8Array = new Uint8Array([0x0086, 0x0084]);

export function parse(stream: Uint8Array): string | Error {
    const streamLength = stream.length;
    let startIndex = -1;
    let endIndex = -1;

    for (let idx = 0; idx < streamLength; idx++) {
        if (idx + 2 > streamLength) {
            return new Error("NoStartPattern");
        }
        const part = stream.slice(idx, idx + 2);

        if (isEqual(part, START_PATTERN)) {
            startIndex = idx + 2;
            break;
        }
    }

    if (startIndex === -1) {
        return new Error("NoStartPattern");
    }

    for (let idx = startIndex; idx < streamLength; idx++) {
        const part = stream.slice(idx, idx + 2);
        if (isEqual(part, END_PATTERN)) {
            endIndex = idx;
            break;
        }
    }

    if (endIndex === -1) {
        return new Error("NoEndPattern");
    }

    const decoded = new TextDecoder().decode(stream.slice(startIndex, endIndex));
    return decoded.length > 1 ? decoded.substr(1) : decoded;
}

function isEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((val, idx) => val === b[idx]);
}

// Tests

import { readFile } from "fs/promises";

async function runTests() {
    try {
        const testsDir = "./test_data/streamtyped/";
        const testData: { [name: string]: string } = {
            AttributedBodyTextOnly: "Noter test",
            AttributedBodyTextOnly2: "Test 3",
            ExtraData: "This is parsing",
            MultiPart: "\u{FFFC}test 1\u{FFFC}test 2 \u{FFFC}test 3",
            URL: "https://github.com/ReagentX/Logria",
            WeirdText: "��������������� ���������������"
        };

        for (const [filename, expected] of Object.entries(testData)) {
            const path = `${testsDir}/${filename}`;
            const fileContent = new Uint8Array(await readFile(path));
            const parsed = parse(fileContent);
            if (parsed instanceof Error) {
                throw parsed;
            }
            if (parsed.slice(0, expected.length) !== expected) {
                throw new Error(`Test failed for '${filename}'`);
            }
        }

        console.log("All tests passed!");
    } catch (error) {
        console.error("Test failed: ", error);
    }
}

runTests();