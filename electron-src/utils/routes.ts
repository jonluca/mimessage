import type { ProtocolRequest, ProtocolResponse } from "electron";
import { protocol, session } from "electron";

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
  addWebRequestToSession(session.defaultSession);
  protocol.registerFileProtocol("mimessage-asset", assetHandler);
}

export function addWebRequestToSession(session: Electron.Session) {
  const localFilter = {
    urls: ["https://users/*", "https://Users/*"],
  };
  const regex = new RegExp("Messages", "g");
  session.webRequest.onBeforeRequest(localFilter, (details, callback) => {
    if (regex.test(details.url)) {
      const redirectURL = details.url.replace("https:/", "mimessage-asset://");
      return callback({ redirectURL });
    }
    return callback({});
  });
}
