/** @type {import('next').NextConfig} */
const env = {};
const disallowedPrefixes = ["NODE_", "__", "NEXT"];
for (const [key, value] of Object.entries(process.env)) {
  if (!disallowedPrefixes.some((k) => key.startsWith(k))) {
    env[key] = value;
  }
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  env,
  experimental: {
    legacyBrowsers: false,
    // preCompiledNextServer: false,
    // disableOptimizedLoading: true,
  },
  compiler: {
    styledComponents: true,
  },
  transpilePackages: ["@mui/material", "lodash-es"],
  modularizeImports: {
    lodash: {
      transform: "lodash/{{member}}",
      preventFullImport: true,
    },
    "@mui/material": {
      transform: "@mui/material/{{member}}",
      preventFullImport: true,
    },
  },
  webpack: (config, { isServer }) => {
    if (Array.isArray(config.target) && config.target.includes("web")) {
      config.target = ["web", "es2022"];
    }
    return config;
  },
};

export default nextConfig;
