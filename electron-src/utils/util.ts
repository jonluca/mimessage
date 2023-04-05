import type { WriteStream } from "fs";
import { app, dialog } from "electron";
import { windows } from "../index";
import isDev from "electron-is-dev";
import { createMainWindow } from "../window/main-window";
import bplist from "bplist-parser";
import { TypedStreamReader, Unarchiver } from "node-typedstream";

export interface Deferred<T> {
  resolve: (arg: T) => void;
  reject: (e?: Error) => void;
  promise: Promise<T>;
}

export function getDeferred<T = void>(): Deferred<T> {
  let resolve: undefined | ((arg: T) => void) = undefined;
  let reject: undefined | ((e?: Error) => void) = undefined;

  const promise = new Promise<T>((resolveCb, rejectCb) => {
    resolve = resolveCb;
    reject = rejectCb;
  });

  // TS thinks we're using these before they're assigned, which is why
  // we need the undefined types, and the any here.
  return { resolve, reject, promise } as any;
}

export function showErrorAlert(title: string, body: string, logStream?: WriteStream) {
  if (logStream) {
    logStream.write(`ALERT: ${title}: ${body}\n`);
  }
  console.warn(`${title}: ${body}`);
  dialog.showErrorBox(title, body);
}
export const showApp = () => {
  app.dock.show();
  if (windows.length > 0) {
    windows[0].show();
  } else {
    createMainWindow();
  }
};

export const decodeMessageBuffer = async (buffer: Buffer) => {
  if (buffer instanceof Buffer) {
    try {
      if (buffer.subarray(0, 6).toString() === "bplist") {
        const parsed = bplist.parseBuffer(buffer);
        return parsed;
      }

      const read = new TypedStreamReader(buffer);
      const unarchiver = new Unarchiver(read);
      const parsed = await unarchiver.decodeAll();
      return parsed;
    } catch (e) {
      // ignore
    }
  }

  return buffer;
};

export const withRetries = async (fn: () => Promise<void>, MAX_ERROR_TRIES = 5) => {
  for (let i = 0; i < MAX_ERROR_TRIES; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      console.log(e);
      if (i == MAX_ERROR_TRIES - 1) {
        throw e;
      }
    }
  }
};
export const installExtensions = async () => {
  if (isDev) {
    const installExtension = await import("electron-devtools-assembler");
    // to do re-enable this when fixed
    await installExtension.default(installExtension.REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: {
        allowFileAccess: true,
      },
    });
  }
};
