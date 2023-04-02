import { notarize } from "electron-notarize";
import { resolve } from "path";
import path from "path";
import * as fs from "fs-extra";
import { appPath } from "../versions";
const DEV_MODE = process.env.APP_ENV === "local";

export const findAndNotarize = async function () {
  if (DEV_MODE || process.platform !== "darwin") {
    console.log("Skipping notarization - not building for Mac");
    return;
  }

  if (!process.env.APPLE_ID) {
    console.log("Skipping notarization - no apple id");
    return;
  }

  console.log("Notarizing...");

  const folderWeAreLookingFor = "dist";

  let absDir = path.join(__dirname, folderWeAreLookingFor);
  // check if the directory exists
  const maxDir = 10;
  let dirUp = 0;
  while (absDir !== "/" && dirUp < maxDir) {
    try {
      await fs.promises.access(absDir, fs.constants.F_OK);
      break;
    } catch (err: any) {
      absDir = path.join(absDir, "../..", folderWeAreLookingFor);
      dirUp++;
    }
  }
  if (dirUp == maxDir) {
    console.error("Could not find dist folder");
    process.exit(1);
    return;
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
      teamId: "8LQ2SQ7R9V",
      appBundleId: appPath,
      appPath: app,
      appleId: process.env.APPLE_ID!,
      appleIdPassword: process.env.APPLE_ID_PASSWORD!,
    }).catch((e) => {
      console.error(e);
      throw e;
    });
  });
  return notaries;
};

export default findAndNotarize;
