import type { BuildOptions } from "esbuild";
import * as path from "path";

const isProduction = process.env.NODE_ENV === "production";
const config: BuildOptions = {
  platform: "node",
  entryPoints: [
    path.resolve("electron-src/index.ts"),
    path.resolve("electron-src/workers/worker.ts"),
    path.resolve("electron-src/workers/embeddings-worker.ts"),
    path.resolve("electron-src/utils/preload.ts"),
  ],
  bundle: true,
  external: ["electron", "next", "horajs", "better-sqlite3", "electron-mac-contacts", "node-electron-permissions"],
  minify: isProduction,
  minifyWhitespace: isProduction,
  minifyIdentifiers: isProduction,
  minifySyntax: isProduction,
  keepNames: !isProduction,
  treeShaking: isProduction,
  target: "node19.9.0",
};

export default config;
