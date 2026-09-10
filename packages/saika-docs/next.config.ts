// SPDX-License-Identifier: MIT
import withBundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

import { publicEnv, readServerEnv } from './src/shared/config/env';
import { securityHeaders } from './src/shared/config/security';

const env = readServerEnv();
const isExport = env.DOCS_OUTPUT === 'export';
if (isExport && publicEnv.NEXT_PUBLIC_WEB_VITALS)
  throw new Error('NEXT_PUBLIC_WEB_VITALS requires server or standalone output');
const nextConfig: NextConfig = {
  agentRules: false,
  typedRoutes: true,
  reactCompiler: true,
  generateBuildId: async () => publicEnv.NEXT_PUBLIC_RELEASE ?? 'saika-docs',
  output: isExport ? 'export' : env.DOCS_OUTPUT === 'standalone' ? 'standalone' : undefined,
  pageExtensions: isExport ? ['tsx', 'ts'] : ['tsx', 'ts', 'server.ts', 'server.tsx'],
  trailingSlash: true,
  basePath: publicEnv.NEXT_PUBLIC_BASE_PATH,
  allowedDevOrigins: ['localhost', '127.0.0.1', 'saika.localhost'],
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { cpus: 4 },
  images: {
    unoptimized: isExport,
    remotePatterns: env.DOCS_IMAGE_HOSTS.map((hostname) => ({ protocol: 'https', hostname })),
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [375, 640, 768, 1024, 1280, 1920],
    imageSizes: [32, 64, 128, 256, 384],
  },
  serverExternalPackages: ['isomorphic-dompurify'],
  rewrites:
    !isExport && env.API_BASE_URL
      ? async () => [{ source: '/backend/:path*', destination: `${env.API_BASE_URL}/api/:path*` }]
      : undefined,
  headers: isExport
    ? undefined
    : async () => [
        {
          source: '/:path*',
          headers: securityHeaders(publicEnv, env, process.env.NODE_ENV === 'development'),
        },
      ],
};

const config = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true', openAnalyzer: false })(nextConfig);
export default publicEnv.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      org: env.SENTRY_ORG,
      project: env.SENTRY_PROJECT,
      authToken: env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
      webpack: { treeshake: { removeDebugLogging: true } },
      widenClientFileUpload: true,
      tunnelRoute: isExport ? undefined : '/monitoring',
      automaticVercelMonitors: true,
      sourcemaps: { disable: !env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
    })
  : config;
