import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const metadataPath = process.argv[2] || "dist/latest-mac.yml";
const minimumSystemVersion = "22.0.0";
const existingMetadata = await readFile(metadataPath, "utf8");
const withoutExistingMinimum = existingMetadata.replace(/^minimumSystemVersion:.*(?:\r?\n|$)/gm, "").trimEnd();

await writeFile(metadataPath, `${withoutExistingMinimum}\nminimumSystemVersion: ${minimumSystemVersion}\n`, "utf8");
