/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Next replaces values in `env` directly in renderer bundles. Keep this an
  // explicit allowlist so credentials from the build machine can never ship
  // inside the desktop app.
  env: {
    APP_ENV: process.env.APP_ENV ?? "local",
  },
  transpilePackages: ["lodash-es"],
  output: "export",
  productionBrowserSourceMaps: false,
};

export default nextConfig;
