import { realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import logger from "./logger";

export const messagesAttachmentsRoot = path.join(os.homedir(), "Library", "Messages", "Attachments");
export const rendererOrigin = "mimessage-app://app";

export class AssetRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const isContainedPath = (rootPath: string, candidatePath: string) => {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== "" && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
};

const expandHomePrefix = (requestedPath: string) => {
  if (requestedPath.startsWith("~/")) {
    return path.join(os.homedir(), requestedPath.slice(2));
  }
  return requestedPath;
};

/** Resolves a database attachment path while rejecting traversal and symlink escapes. */
export const resolveAttachmentPath = async (requestedPath: string, rootPath = messagesAttachmentsRoot) => {
  if (!requestedPath || requestedPath.includes("\0")) {
    throw new AssetRequestError(400, "Invalid attachment path");
  }

  const expandedPath = expandHomePrefix(requestedPath);
  if (!path.isAbsolute(expandedPath)) {
    throw new AssetRequestError(400, "Attachment path must be absolute");
  }

  let resolvedRoot: string;
  let resolvedPath: string;
  try {
    [resolvedRoot, resolvedPath] = await Promise.all([realpath(rootPath), realpath(expandedPath)]);
  } catch {
    throw new AssetRequestError(404, "Attachment not found");
  }

  if (!isContainedPath(resolvedRoot, resolvedPath)) {
    throw new AssetRequestError(403, "Attachment path is outside Messages attachments");
  }
  if (!(await stat(resolvedPath)).isFile()) {
    throw new AssetRequestError(404, "Attachment is not a file");
  }
  return resolvedPath;
};

export const pathFromRequestUrl = (requestUrl: string) => {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    throw new AssetRequestError(400, "Invalid attachment URL");
  }

  const queryPath = url.searchParams.get("path");
  if (queryPath) {
    return queryPath;
  }

  // Preserve the renderer's existing `mimessage-asset:///absolute/path` form.
  // A host is included for defensive compatibility with the two-slash form.
  try {
    return decodeURIComponent(`${url.host ? `/${url.host}` : ""}${url.pathname}`);
  } catch {
    throw new AssetRequestError(400, "Invalid attachment path encoding");
  }
};

export type AssetFileFetcher = (url: string, init: RequestInit) => Promise<Response>;

const fetchLocalFile: AssetFileFetcher = async (url, init) => {
  const { net } = await import("electron");
  return net.fetch(url, init);
};

export const createAssetHandler =
  (rootPath = messagesAttachmentsRoot, fetchFile: AssetFileFetcher = fetchLocalFile) =>
  async (request: Request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    try {
      const attachmentPath = await resolveAttachmentPath(pathFromRequestUrl(request.url), rootPath);
      const response = await fetchFile(pathToFileURL(attachmentPath).toString(), {
        headers: request.headers,
        method: request.method,
      });

      // The existing video element requests anonymous CORS. Restrict the response
      // header to the two renderer origins instead of exposing arbitrary local files.
      const origin = request.headers.get("origin");
      if (origin === "http://localhost:3020" || origin === rendererOrigin) {
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", origin);
        return new Response(response.body, {
          headers,
          status: response.status,
          statusText: response.statusText,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof AssetRequestError) {
        return new Response(error.message, { status: error.status });
      }
      logger.error(`Failed to serve Messages attachment: ${String(error)}`);
      return new Response("Unable to read attachment", { status: 500 });
    }
  };

export const assetHandler = createAssetHandler();

export const resolveRendererAssetPath = async (requestUrl: string, rootPath: string) => {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    throw new AssetRequestError(400, "Invalid renderer URL");
  }
  if (url.protocol !== "mimessage-app:" || url.host !== "app" || url.username || url.password) {
    throw new AssetRequestError(403, "Invalid renderer origin");
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new AssetRequestError(400, "Invalid renderer path encoding");
  }
  if (pathname.includes("\0")) {
    throw new AssetRequestError(400, "Invalid renderer path");
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidatePath = path.resolve(rootPath, relativePath);
  let resolvedRoot: string;
  let resolvedPath: string;
  try {
    [resolvedRoot, resolvedPath] = await Promise.all([realpath(rootPath), realpath(candidatePath)]);
  } catch {
    throw new AssetRequestError(404, "Renderer asset not found");
  }
  if (!isContainedPath(resolvedRoot, resolvedPath) || !(await stat(resolvedPath)).isFile()) {
    throw new AssetRequestError(403, "Renderer asset is outside the application bundle");
  }
  return resolvedPath;
};

export const createRendererHandler =
  (rootPath: string, fetchFile: AssetFileFetcher = fetchLocalFile) =>
  async (request: Request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    try {
      const rendererPath = await resolveRendererAssetPath(request.url, rootPath);
      const response = await fetchFile(pathToFileURL(rendererPath).toString(), { method: "GET" });
      if (request.method === "HEAD") {
        return new Response(null, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof AssetRequestError) {
        return new Response(error.message, { status: error.status });
      }
      logger.error(`Failed to serve renderer asset: ${String(error)}`);
      return new Response("Unable to read renderer asset", { status: 500 });
    }
  };

export async function setupRouteHandlers() {
  const { app, protocol } = await import("electron");
  if (!protocol.isProtocolHandled("mimessage-app")) {
    const rendererRoot = path.join(app.getAppPath(), "src", "out");
    protocol.handle("mimessage-app", createRendererHandler(rendererRoot));
  }
  if (!protocol.isProtocolHandled("mimessage-asset")) {
    protocol.handle("mimessage-asset", assetHandler);
  }
}
