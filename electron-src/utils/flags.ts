import type { App } from "electron";
export const addFlags = (app: App) => {
  process.env.UV_THREADPOOL_SIZE = "128";
  app.commandLine.appendSwitch(
    "enable-features",
    "HardwareMediaKeyHandling,MediaSessionService,WebGPU,WebGPUDeveloperFeatures,WebGPUImportTexture,CSSVideoDynamicRangeMediaQueries,ExtraWebGLVideoTextureMetadata",
  );
  app.commandLine.appendSwitch("ignore-connections-limit", "localhost");
  app.commandLine.appendArgument("--enable-experimental-web-platform-features");
  app.commandLine.appendSwitch(
    '--js-flags="--max-old-space-size=32678 --max-semi-space-size=32678 --use-largepages=silent"',
  );
  app.commandLine.appendSwitch("--remote-allow-origins=*");
};
