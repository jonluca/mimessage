import { dirname, resolve } from "path";
import path from "path";
import fs from "fs-extra";
import packageJson from "../../package.json" assert { type: "json" };

const appPath = packageJson.build.appId;
import { notarize } from "./notarize-utils";
import { fileURLToPath } from "url";
const DEV_MODE = process.env.APP_ENV === "local";

if (DEV_MODE || process.platform !== "darwin") {
  console.log("Skipping notarization - not building for Mac");
  process.exit(0);
}

if (!process.env.APPLE_ID) {
  console.log("Skipping notarization - no apple id");
  process.exit(0);
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
  } catch (err: any) {
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

const notaries = apps.map((app) => {
  return notarize({
    tool: "notarytool",
    teamId: "F35YQQ5672",
    appBundleId: appPath,
    appPath: app,
    appleId: process.env.APPLE_ID!,
    appleIdPassword: process.env.APPLE_ID_PASSWORD!,
  }).catch((e) => {
    console.error(e);
    throw e;
  });
});

await Promise.all(notaries);
