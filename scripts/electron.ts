import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, context, type BuildOptions, type BuildResult, type Plugin } from "esbuild";
import { electronBuildConfigurations as configs, electronOutputDirectory } from "../electron-src/esbuild.main.config";
import { buildLiquidGlassAddon } from "./build-liquid-glass.mjs";

const command = process.argv[2];
if (command !== "build" && command !== "dev") {
  throw new Error("Usage: tsx scripts/electron.ts <build|dev> [electron arguments]");
}

const isDevelopment = command === "dev";
const nodeEnvironment = isDevelopment ? "development" : "production";
const electronArguments = process.argv.slice(3).filter((argument, index) => argument !== "--" || index !== 0);
const mainEntry = path.join(electronOutputDirectory, "index.js");
const electronBinary = path.resolve("node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");

await buildLiquidGlassAddon();

const withEnvironment = (config: BuildOptions): BuildOptions => ({
  ...config,
  define: {
    ...config.define,
    "process.env.NODE_ENV": JSON.stringify(nodeEnvironment),
  },
  sourcemap: isDevelopment ? "inline" : "external",
});

await rm(electronOutputDirectory, { force: true, recursive: true });

if (!isDevelopment) {
  await Promise.all(configs.map((config) => build(withEnvironment(config))));
  process.exit(0);
}

if (configs.length !== 1) {
  throw new Error(`Development mode expects one esbuild configuration, received ${configs.length}`);
}

let electronProcess: ChildProcess | undefined;
let restarting = false;
let shuttingDown = false;
let restartQueue = Promise.resolve();

const stopElectron = async () => {
  const child = electronProcess;
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
    child.once("exit", () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill("SIGTERM");
  });
};

const launchElectron = () => {
  const child = spawn(electronBinary, [mainEntry, ...electronArguments], {
    env: { ...process.env, NODE_ENV: nodeEnvironment },
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  electronProcess = child;
  child.once("exit", (code) => {
    if (electronProcess === child) {
      electronProcess = undefined;
    }
    if (!restarting && !shuttingDown) {
      void shutdown(code ?? 1);
    }
  });
};

const restartElectron = () => {
  restartQueue = restartQueue.then(async () => {
    restarting = true;
    await stopElectron();
    restarting = false;
    if (!shuttingDown) {
      launchElectron();
    }
  });
};

const restartPlugin: Plugin = {
  name: "restart-electron",
  setup(esbuild) {
    esbuild.onEnd((result: BuildResult) => {
      if (result.errors.length === 0) {
        restartElectron();
      }
    });
  },
};

const devConfig = withEnvironment(configs[0]);
const buildContext = await context({
  ...devConfig,
  plugins: [...(devConfig.plugins ?? []), restartPlugin],
});

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await stopElectron();
  await buildContext.dispose();
  process.exit(exitCode);
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

await buildContext.watch();
