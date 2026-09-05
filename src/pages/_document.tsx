import { Head, Html, Main, NextScript } from "next/document";

const production = process.env.APP_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  production ? "script-src 'self'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: mimessage-asset:",
  "media-src 'self' blob: mimessage-asset:",
  "font-src 'self' data:",
  production
    ? "connect-src 'self' https://api.openai.com"
    : "connect-src 'self' https://api.openai.com http://localhost:3020 ws://localhost:3020",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
