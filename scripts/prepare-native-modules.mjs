import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildLiquidGlassAddon } from "./build-liquid-glass.mjs";

const nodeModulesDirectory = fileURLToPath(new URL("../node_modules/", import.meta.url));

export const clearElectronRebuildMetadata = async () => {
  const packageDirectories = [];

  for (const entry of await readdir(nodeModulesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(nodeModulesDirectory, entry.name);
    if (!entry.name.startsWith("@")) {
      packageDirectories.push(entryPath);
      continue;
    }

    for (const scopedEntry of await readdir(entryPath, { withFileTypes: true })) {
      if (scopedEntry.isDirectory()) {
        packageDirectories.push(path.join(entryPath, scopedEntry.name));
      }
    }
  }

  await Promise.all(
    packageDirectories.flatMap((packageDirectory) =>
      ["Debug", "Release"].map((buildType) =>
        rm(path.join(packageDirectory, "build", buildType, ".forge-meta"), { force: true }),
      ),
    ),
  );
};

export const beforeBuild = async (context) => {
  await clearElectronRebuildMetadata();
  if (!context || context.platform?.nodeName === "darwin") {
    await buildLiquidGlassAddon({
      arch: context?.arch || process.arch,
      electronVersion: context?.electronVersion,
    });
  }
  return true;
};

export default beforeBuild;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await beforeBuild();
}
