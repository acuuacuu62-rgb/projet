import type { NextConfig } from "next";

// Keep the browser on its own origin, including when the API is on another host.
function apiDestination() {
  const configured = process.env.API_UPSTREAM_URL;
  if (!configured) return "http://127.0.0.1:4000/v1/:path*";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("API_UPSTREAM_URL must be an HTTPS API URL ending in /v1");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/+$/, "") !== "/v1"
  )
    throw new Error("API_UPSTREAM_URL must be an HTTPS API URL ending in /v1");
  return `${url.origin}/v1/:path*`;
}

const config: NextConfig = {
  logging: { incomingRequests: false, serverFunctions: false },
  async rewrites() {
    return [{ source: "/api/:path*", destination: apiDestination() }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
