import type { BuildOptions } from "esbuild";
import * as path from "path";

const config: BuildOptions = {
  platform: "node",
  entryPoints: [
    path.resolve("electron-src/index.ts"),
    path.resolve("electron-src/utils/preload.ts"),
    path.resolve("electron-src/hooks/notarize.ts"),
  ],
  bundle: true,
  external: ["next", "better-sqlite3", "node-mac-contacts", "node-mac-permissions"],
  treeShaking: true,
  target: "node19.4.0", // electron version target
};

export default config;
