export type AppEnv = "development" | "production" | "local";
const getEnv = (): AppEnv => {
  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (host.startsWith("dev-")) {
      return "development";
    }
  }
  return (process.env.APP_ENV as AppEnv) || (process.env.NEXT_PUBLIC_APP_ENV as AppEnv) || "local";
};
export const AppEnv: AppEnv = getEnv();

export const isProd = AppEnv === "production";
