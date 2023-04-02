import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { RangeRequestsPlugin } from "workbox-range-requests";
import { ExpirationPlugin } from "workbox-expiration";

/**
 * Discarded - need this string here so that the logic for replacing this component works in the build
 */

// @ts-ignore
const discard = self.__WB_MANIFEST;
// @ts-ignore
self.__WB_DISABLE_DEV_LOGS = true;
const cacheableAssetDestinations: RequestDestination[] = ["image", "video", "audio"];

// In your service public:
// It's up to you to either precache, use warmRuntimeCache, or
// explicitly call cache.add() to populate the cache with media assets.
// If you choose to cache media assets up front, do so with care,
// as they can be quite large and exceed storage quotas.
//
// This route will go to the network if there isn't a cache match,
// but it won't populate the cache at runtime because the response for
// the media asset will be a partial 206 response. If there is a cache
// match, then it will properly serve partial responses.
registerRoute(
  (opts) => {
    const { destination, url } = opts.request;
    return cacheableAssetDestinations.includes(destination) || url?.startsWith("https://users/");
  },
  new CacheFirst({
    cacheName: `mimessage-asset-cache`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [200],
      }),
      new RangeRequestsPlugin(),
      new ExpirationPlugin({
        maxAgeSeconds: 60 * 60 * 24,
      }),
    ],
  }),
);
