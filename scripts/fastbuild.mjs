import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const developerIdName = "Developer ID Application: JonLuca De Caro (F35YQQ5672)";
const identityOutput = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
  encoding: "utf8",
});
const identityPattern = /^\s*\d+\)\s+([A-F0-9]{40})\s+"(.+)"$/;
const identities = identityOutput.split("\n").flatMap((line) => {
  const match = line.match(identityPattern);
  return match?.[2] === developerIdName ? [match[1]] : [];
});

if (!identities.length) {
  throw new Error(`A valid ${developerIdName} signing identity is required for a stable Contacts permission grant.`);
}

const electronBuilder = path.resolve("node_modules", ".bin", "electron-builder");
const args = [
  "build",
  "--dir",
  `-c.mac.identity=${identities[0]}`,
  "-c.mac.sign=./scripts/sign-macos.mjs",
  "-c.mac.notarize=false",
  "-c.mac.entitlements=electron-src/entitlements.dev.plist",
  "-c.mac.entitlementsInherit=electron-src/entitlements.dev.plist",
  ...process.argv.slice(2),
];
const child = spawn(electronBuilder, args, {
  env: { ...process.env, MIMESSAGE_CODESIGN_IDENTITY: identities[0] },
  stdio: "inherit",
});
const signalExitCode = 128;

child.once("error", (error) => {
  throw error;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? signalExitCode : 1);
});
