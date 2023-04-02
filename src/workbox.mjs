import path from "path";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import { InjectManifest } from "workbox-webpack-plugin";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @param nextConfig {import('next').NextConfig}
 */
function withWorkbox(nextConfig) {
  const extractedConfig = nextConfig.workbox;
  delete nextConfig.workbox;
  const workboxConfig = {
    ...nextConfig,
    webpack(config, options) {
      if (typeof nextConfig.webpack === "function") {
        config = nextConfig.webpack(config, options);
      }

      let isProd = process.env.NODE_ENV === "production";
      const {
        additionalManifestEntries = [],
        dest = "public",
        dontCacheBustURLsMatching = false,
        exclude = [],
        force = true,
        modifyURLPrefix = {},
        swDest = "sw.js",
        swSrc = "utils/worker.ts",
        mode = isProd ? "production" : undefined,
        ...workboxOptions
      } = extractedConfig;
      const { dev, isServer } = options;

      if (isServer) {
        return config;
      }

      if (dev && !force) {
        return config;
      }

      const swDestPath = path.join(options.dir, dest, swDest);

      config.plugins.push(
        new CleanWebpackPlugin({
          cleanOnceBeforeBuildPatterns: [swDestPath, `${swDestPath}.map`],
        }),
      );

      const defaultDontCacheBustURLsMatching = /^\/_next\/static\/.*/iu;

      const defaultWorkboxOptions = {
        swDest: swDestPath,
        dontCacheBustURLsMatching: dontCacheBustURLsMatching
          ? new RegExp(`${dontCacheBustURLsMatching.source}|${defaultDontCacheBustURLsMatching.source}`, "iu")
          : defaultDontCacheBustURLsMatching,
        exclude: [
          /build-manifest\.json$/i,
          /middleware-build-manifest\.js$/i,
          /react-loadable-manifest/i,
          /\/_error\.js$/i,
          /\.js\.map$/i,
          ...exclude,
        ],
        modifyURLPrefix: {
          [`${config.output.publicPath || ""}static/`]: "/_next/static/",
          ...modifyURLPrefix,
        },
      };

      const swSrcPath = path.join(options.dir, swSrc);
      config.plugins.push(
        new InjectManifest({
          swSrc: swSrcPath,
          ...defaultWorkboxOptions,
          ...workboxOptions,
        }),
      );

      return config;
    },
  };
  return workboxConfig;
}

export default withWorkbox;
