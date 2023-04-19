import type { App } from "electron";
export const addFlags = (app: App) => {
  process.env.NODE_OPTIONS = "--max-old-space-size=32678";
  app.commandLine.appendSwitch(
    "enable-features",
    "HardwareMediaKeyHandling,MediaSessionService,WebGPU,WebGPUDeveloperFeatures,WebGPUImportTexture,CSSVideoDynamicRangeMediaQueries,ExtraWebGLVideoTextureMetadata",
  );
  app.commandLine.appendSwitch("ignore-connections-limit", "localhost");
  app.commandLine.appendArgument("--enable-experimental-web-platform-features");
  app.commandLine.appendSwitch('--js-flags="--max-old-space-size=32678');
  app.commandLine.appendSwitch("--remote-allow-origins=*");
};
