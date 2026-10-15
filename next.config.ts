import type { NextConfig } from "next";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), clipboard-write=(self), nfc=(self)",
  },
  {
    key: "Content-Security-Policy",
    value:
      `default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://sdk.cashfree.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.cashfree.com; frame-src https://*.cashfree.com; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com`,
  },
];
const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
