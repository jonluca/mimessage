import { execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const addonDirectory = path.join(projectRoot, "native", "liquid-glass");
const addonFileName = "mimessage_liquid_glass.node";
const supportedArchitectures = new Set(["arm64", "x64"]);

const assertLiquidGlassSdk = async () => {
  const [{ stdout: versionOutput }, { stdout: pathOutput }] = await Promise.all([
    execFileAsync("xcrun", ["--sdk", "macosx", "--show-sdk-version"]),
    execFileAsync("xcrun", ["--sdk", "macosx", "--show-sdk-path"]),
  ]);
  const sdkVersion = versionOutput.trim();
  const sdkMajorVersion = Number.parseInt(sdkVersion.split(".")[0] ?? "", 10);
  if (!Number.isFinite(sdkMajorVersion) || sdkMajorVersion < 26) {
    throw new Error(
      `Liquid Glass packaging requires the macOS 26 SDK or newer; xcrun selected ${sdkVersion || "an unknown SDK"}`,
    );
  }
  const glassHeader = path.join(
    pathOutput.trim(),
    "System",
    "Library",
    "Frameworks",
    "AppKit.framework",
    "Headers",
    "NSGlassEffectView.h",
  );
  try {
    await access(glassHeader);
  } catch {
    throw new Error(`The selected macOS ${sdkVersion} SDK does not contain NSGlassEffectView.h`);
  }
  return sdkVersion;
};

const assertAddonArchitecture = async (addonPath, arch) => {
  const expectedArchitecture = arch === "x64" ? "x86_64" : arch;
  const { stdout } = await execFileAsync("lipo", ["-archs", addonPath]);
  const architectures = stdout.trim().split(/\s+/).filter(Boolean);
  if (architectures.length !== 1 || architectures[0] !== expectedArchitecture) {
    throw new Error(
      `Liquid Glass bridge architecture mismatch: expected ${expectedArchitecture}, found ${architectures.join(", ") || "none"}`,
    );
  }
};

const readInstalledElectronVersion = async () => {
  const electronPackage = JSON.parse(
    await readFile(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8"),
  );
  if (typeof electronPackage.version !== "string" || !electronPackage.version) {
    throw new Error("Unable to determine the installed Electron version");
  }
  return electronPackage.version;
};

export const liquidGlassPrebuildPath = (arch) =>
  path.join(addonDirectory, "prebuilds", `darwin-${arch}`, addonFileName);

export const buildLiquidGlassAddon = async ({ arch = process.arch, electronVersion } = {}) => {
  if (process.platform !== "darwin") {
    return null;
  }
  if (!supportedArchitectures.has(arch)) {
    throw new Error(`Unsupported Liquid Glass architecture: ${arch}`);
  }

  const targetElectronVersion = electronVersion || (await readInstalledElectronVersion());
  const sdkVersion = await assertLiquidGlassSdk();
  const nodeGyp = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
  );
  await access(nodeGyp);

  const buildDirectory = await mkdtemp(path.join(os.tmpdir(), "mimessage-liquid-glass-"));
  try {
    await Promise.all(
      ["binding.gyp", "liquid_glass.mm"].map((fileName) =>
        copyFile(path.join(addonDirectory, fileName), path.join(buildDirectory, fileName)),
      ),
    );

    console.log(
      `Building public AppKit Liquid Glass bridge for Electron ${targetElectronVersion} (${arch}, macOS SDK ${sdkVersion})`,
    );
    await execFileAsync(
      nodeGyp,
      ["rebuild", `--target=${targetElectronVersion}`, `--arch=${arch}`, "--dist-url=https://electronjs.org/headers"],
      {
        cwd: buildDirectory,
        env: {
          ...process.env,
          npm_config_arch: arch,
          npm_config_target_arch: arch,
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const builtAddon = path.join(buildDirectory, "build", "Release", addonFileName);
    await access(builtAddon);
    await assertAddonArchitecture(builtAddon, arch);

    const prebuild = liquidGlassPrebuildPath(arch);
    await mkdir(path.dirname(prebuild), { recursive: true });
    const stagedPrebuild = `${prebuild}.${process.pid}.${Date.now()}.tmp`;
    try {
      await copyFile(builtAddon, stagedPrebuild);
      await rename(stagedPrebuild, prebuild);
    } finally {
      await rm(stagedPrebuild, { force: true });
    }
    return prebuild;
  } finally {
    await rm(buildDirectory, { force: true, recursive: true });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archArgument = process.argv.find((argument) => argument.startsWith("--arch="));
  const electronVersionArgument = process.argv.find((argument) => argument.startsWith("--electron-version="));
  await buildLiquidGlassAddon({
    arch: archArgument?.slice("--arch=".length) || process.arch,
    electronVersion: electronVersionArgument?.slice("--electron-version=".length),
  });
}
