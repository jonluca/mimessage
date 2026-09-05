import type { BuildOptions } from "esbuild";
import * as path from "path";

export const electronOutputDirectory = path.resolve("build/electron-src");

export const electronBuildConfigurations: BuildOptions[] = [
  {
    platform: "node",
    entryPoints: [
      path.resolve("electron-src/index.ts"),
      path.resolve("electron-src/workers/worker.ts"),
      path.resolve("electron-src/workers/embeddings-worker.ts"),
      path.resolve("electron-src/utils/preload.ts"),
    ],
    bundle: true,
    outbase: path.resolve("electron-src"),
    outdir: electronOutputDirectory,
    external: ["electron", "next", "better-sqlite3", "electron-mac-contacts"],
    minify: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    treeShaking: true,
    target: "node24",
  },
];
