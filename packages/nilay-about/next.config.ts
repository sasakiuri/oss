import type { NextConfig } from 'next';

/**
 * Security headers for the application
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/headers
 */
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    // Labs asks for these on this origin only and never without a click, and nothing leaves the device:
    // the camera photographs targets and pattern boards, the microphone hears shots for the shot timer,
    // and the position works out the hunting hours and places the reader on a map.
    value: 'camera=(self), microphone=(self), geolocation=(self)',
  },
];

/**
 * The version of the Labs offline cache (`public/labs-sw.js`), one per build. The service worker is
 * registered with it, so each deployment installs a worker of its own and retires the previous cache.
 * On Vercel it is the deployment; elsewhere the time of the build.
 */
const labsOfflineVersion =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36);

const nextConfig: NextConfig = {
  agentRules: false,
  env: {
    NEXT_PUBLIC_LABS_OFFLINE_VERSION: labsOfflineVersion,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.nilay.jp',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

const config = async () => {
  if (process.env.ANALYZE === 'true') {
    const bundleAnalyzer = (await import('@next/bundle-analyzer')).default as (options: {
      enabled: boolean;
    }) => (config: NextConfig) => NextConfig;
    return bundleAnalyzer({ enabled: true })(nextConfig);
  }
  return nextConfig;
};

export default config;
