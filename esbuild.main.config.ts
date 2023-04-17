import type { BuildOptions } from "esbuild";
import * as path from "path";

const config: BuildOptions = {
  platform: "node",
  entryPoints: [
    path.resolve("electron-src/index.ts"),
    path.resolve("electron-src/data/worker.ts"),
    path.resolve("electron-src/utils/preload.ts"),
  ],
  bundle: true,
  external: ["next", "better-sqlite3", "electron-mac-contacts", "node-mac-permissions"],
  treeShaking: true,
  target: "node19.4.0", // electron version target
};

export default config;
