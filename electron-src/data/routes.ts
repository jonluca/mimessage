import type { ProtocolRequest, ProtocolResponse } from "electron";
import { protocol, session } from "electron";
import { appPath } from "../versions";

export function assetHandler(req: ProtocolRequest, callback: (response: string | ProtocolResponse) => void) {
  const requestedPath = decodeURI(req.url).replace("mimessage-asset://", "");
  callback({
    path: requestedPath,
    // always cache
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      Etag: "123",
    },
  });
}

export function setupRouteHandlers() {
  const localFilter = {
    urls: ["https://users/*", "https://Users/*"],
  };
  const regex = new RegExp(appPath, "g");
  session.defaultSession.webRequest.onBeforeRequest(localFilter, (details, callback) => {
    if (regex.test(details.url)) {
      const redirectURL = details.url.replace("https:/", "mimessage-asset://");
      return callback({ redirectURL });
    }
    return callback({});
  });
  protocol.registerFileProtocol("mimessage-asset", assetHandler);
}
