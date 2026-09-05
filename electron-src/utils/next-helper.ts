import type { Server } from "http";
import path, { isAbsolute } from "path";
import { app } from "electron";
import isDev from "electron-is-dev";
import * as fs from "fs";

let server: Server | undefined;
const devServer = async (dir: string, port: number) => {
  // We need to load it here because the app's production
  // bundle shouldn't include it, which would result
  // in an error
  const nextjs = await import("next");
  const next = nextjs.default({ dev: true, dir, quiet: true });
  const requestHandler = next.getRequestHandler();

  // Build the renderer code and watch the files
  await next.prepare();

  if (server) {
    server.close();
  }
  const { createServer } = await import("http");

  // But if developing the application, create a
  // new native HTTP server (which supports hot code reloading)
  server = createServer(requestHandler);

  server.listen(port, () => {
    // Make sure to stop the server when the app closes
    // Otherwise it keeps running on its own
    app.on("before-quit", () => server?.close());
  });
};

export default async (directories: string | { production: string; development: string }, port = 8000) => {
  if (!directories) {
    throw new Error("Renderer location not defined");
  }

  if (typeof directories === "string") {
    directories = {
      production: directories,
      development: directories,
    };
  }

  if (!isDev) {
    return;
  }

  for (const directory in directories) {
    const dir = directory as keyof typeof directories;
    if (!{}.hasOwnProperty.call(directories, dir)) {
      continue;
    }

    const definedDirectory = directories[dir];
    if (!isAbsolute(definedDirectory)) {
      let absDir = path.join(__dirname, definedDirectory);
      // check if the directory exists
      const maxDir = 10;
      let dirUp = 0;
      while (absDir !== "/" && dirUp < maxDir) {
        try {
          await fs.promises.access(absDir, fs.constants.F_OK);
          break;
        } catch {
          absDir = path.join(absDir, "..", definedDirectory);
          dirUp++;
        }
      }
      directories[dir] = absDir;
    }
  }

  await devServer(directories.development, port);
};
