import type { App } from "electron";

// Electron 44 and its bundled Chromium enable the stable media features used by
// MiMessage without command-line switches. Keep this hook so startup code does
// not need a special case, but do not weaken origin checks or force oversized
// renderer/worker heaps.
export const addFlags = (_app: App) => undefined;
