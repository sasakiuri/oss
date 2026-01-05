import type { NextConfig } from "next";

/**
 * Security headers for the application
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/headers
 */
const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default async () => {
  if (process.env.ANALYZE === "true") {
    const bundleAnalyzer = (await import("@next/bundle-analyzer")).default;
    return bundleAnalyzer({ enabled: true })(nextConfig);
  }
  return nextConfig;
};
