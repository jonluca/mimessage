import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const modulePath = require.resolve("app-builder-lib/out/codeSign/macCodeSign.js");
const source = await readFile(modulePath, "utf8");
const calls = [];
const certificates = new Map([
  ["fixture-application", "/fixture/application.p12"],
  ["fixture-installer", "/fixture/installer.p12"],
]);
const unexpectedOperation = () => {
  throw new Error("The signing fixture must not execute external commands or access real credentials");
};
const dependencies = {
  "builder-util": {
    exec: async (command, args) => {
      assert.equal(command, "/usr/bin/security");
      calls.push(Array.from(args));
      return args[0] === "list-keychains" && args.length === 3 ? '"/fixture/login.keychain"\n' : "";
    },
    log: { warn: unexpectedOperation },
    unlinkIfExists: unexpectedOperation,
    copyFile: unexpectedOperation,
  },
  "../util/dynamicImport": { dynamicImport: unexpectedOperation },
  crypto: { createHash, randomBytes: () => Buffer.from("synthetic-keychain-password") },
  "fs/promises": { rename: unexpectedOperation },
  "lazy-val": {
    Lazy: class {
      get value() {
        return unexpectedOperation();
      }
    },
  },
  os: { homedir: () => "/fixture/home", tmpdir: () => "/fixture/tmp" },
  path,
  "temp-file": { getTempName: unexpectedOperation },
  "../util/flags": {},
  "./codesign": {
    importCertificate: async (link) => {
      assert.ok(certificates.has(link), "only synthetic certificate links may be imported");
      return certificates.get(link);
    },
  },
};

const exports = {};
vm.runInNewContext(
  source,
  {
    exports,
    __dirname: path.dirname(modulePath),
    // Skip the unrelated bundled root-certificate installation. Everything
    // createKeychain imports is explicitly stubbed; no real process is exposed.
    process: { platform: "darwin", env: { TRAVIS: "true" } },
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected signing dependency: ${name}`);
      return dependencies[name];
    },
  },
  { filename: modulePath },
);

const result = await exports.createKeychain({
  tmpDir: {},
  currentDir: "/fixture/project",
  cscLink: "fixture-application",
  cscKeyPassword: "synthetic-application-password",
  cscILink: "fixture-installer",
  cscIKeyPassword: "synthetic-installer-password",
});

const commands = (name) => calls.filter((args) => args[0] === name);
const argument = (args, flag) => args[args.indexOf(flag) + 1];
assert.equal(commands("create-keychain").length, 1);
const generatedPassword = argument(commands("create-keychain")[0], "-p");
assert.equal(generatedPassword, Buffer.from("synthetic-keychain-password").toString("base64"));
assert.deepEqual(
  commands("unlock-keychain").map((args) => argument(args, "-p")),
  [generatedPassword],
);
assert.deepEqual(
  commands("import").map((args) => [args[1], argument(args, "-P"), argument(args, "-k")]),
  [
    ["/fixture/application.p12", "synthetic-application-password", result.keychainFile],
    ["/fixture/installer.p12", "synthetic-installer-password", result.keychainFile],
  ],
  "each PKCS12 import must use its own archive password",
);
assert.deepEqual(
  commands("set-key-partition-list").map((args) => [argument(args, "-k"), args.at(-1)]),
  [
    [generatedPassword, result.keychainFile],
    [generatedPassword, result.keychainFile],
  ],
  "both identity partition lists must use the generated keychain password, not archive passwords",
);
console.log("Signing keychain fixture passed: generated keychain password and distinct PKCS12 passwords");
