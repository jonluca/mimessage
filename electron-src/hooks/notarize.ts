import { dirname, resolve } from "path";
import path from "path";
import fs from "fs-extra";

import { notarize } from "./notarize-utils";
import { fileURLToPath } from "url";
const DEV_MODE = process.env.APP_ENV === "local";

if (DEV_MODE || process.platform !== "darwin") {
  console.log("Skipping notarization - not building for Mac");
  process.exit(0);
}

const appleApiKey = process.env.APPLE_API_KEY;
const appleApiKeyId = process.env.APPLE_API_KEY_ID;
const appleApiIssuer = process.env.APPLE_API_ISSUER;
const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD;
const apiKeyCredentials =
  appleApiKey && appleApiKeyId && appleApiIssuer ? { appleApiIssuer, appleApiKey, appleApiKeyId } : null;
const passwordCredentials =
  process.env.APPLE_ID && appleIdPassword && process.env.APPLE_TEAM_ID
    ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword,
        teamId: process.env.APPLE_TEAM_ID,
      }
    : null;

const notarizationCredentials = apiKeyCredentials || passwordCredentials;
if (!notarizationCredentials) {
  throw new Error(
    "APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER are required for notarization (Apple ID credentials remain supported as a fallback)",
  );
}

console.log("Notarizing...");

const folderWeAreLookingFor = "dist";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let absDir = path.join(__dirname, folderWeAreLookingFor);
// check if the directory exists
const maxDir = 10;
let dirUp = 0;
while (absDir !== "/" && dirUp < maxDir) {
  try {
    await fs.access(absDir, fs.constants.F_OK);
    break;
  } catch {
    absDir = path.join(absDir, "../..", folderWeAreLookingFor);
    dirUp++;
  }
}
if (dirUp == maxDir) {
  console.error("Could not find dist folder");
  process.exit(1);
}

const builds = fs.readdirSync(absDir);

const paths = [];
for (const dir of builds) {
  const path = resolve(absDir, dir);
  const stat = fs.lstatSync(path);
  if (stat.isDirectory()) {
    const subPaths = fs.readdirSync(path).map((l) => resolve(path, l));
    paths.push(...subPaths);
  }
}

const apps = paths.filter((path) => path.endsWith(".app"));
if (!apps.length) {
  throw new Error(`No .app bundles were found under ${absDir}`);
}

const notaries = apps.map((app) => {
  return notarize({
    tool: "notarytool",
    appPath: app,
    ...notarizationCredentials,
  }).catch((e) => {
    console.error(e);
    throw e;
  });
});

await Promise.all(notaries);
