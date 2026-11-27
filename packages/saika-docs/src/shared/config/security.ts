// SPDX-License-Identifier: MIT
import type { z } from 'zod';

import type { publicEnvSchema, serverEnvSchema } from './env';

type PublicConfig = z.output<typeof publicEnvSchema>;
type ServerConfig = z.output<typeof serverEnvSchema>;

/**
 * The site's Content Security Policy. A static page passes the hashes of its inline scripts: its
 * policy then allows inline scripts only by hash, forbids script attributes, and leaves out the
 * directives that a meta element cannot deliver.
 */
export function contentSecurityPolicy(
  publicConfig: PublicConfig,
  serverConfig: ServerConfig,
  { development = false, scriptHashes }: { development?: boolean; scriptHashes?: string[] } = {},
) {
  const meta = scriptHashes !== undefined;
  const script = [
    "'self'",
    ...(meta ? [] : ["'unsafe-inline'"]),
    "'wasm-unsafe-eval'",
    ...(development ? ["'unsafe-eval'"] : []),
  ];
  const connect = ["'self'", ...(development ? ['ws:', 'wss:'] : [])];
  const images = ["'self'", 'data:', 'blob:', ...serverConfig.DOCS_IMAGE_HOSTS.map((host) => `https://${host}`)];
  if (publicConfig.NEXT_PUBLIC_SENTRY_DSN) connect.push(new URL(publicConfig.NEXT_PUBLIC_SENTRY_DSN).origin);
  if (publicConfig.NEXT_PUBLIC_GTM_ID) {
    script.push('https://www.googletagmanager.com');
    connect.push(
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://www.googletagmanager.com',
    );
    images.push('https://www.googletagmanager.com', 'https://*.google-analytics.com');
  }
  if (publicConfig.NEXT_PUBLIC_CLARITY_ID) {
    script.push('https://www.clarity.ms', 'https://scripts.clarity.ms');
    connect.push('https://*.clarity.ms');
    images.push('https://*.clarity.ms', 'https://c.bing.com');
  }
  const directives = [
    "default-src 'self'",
    `script-src ${[...script, ...(scriptHashes ?? [])].join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (!meta) directives.push("frame-ancestors 'none'");
  if (serverConfig.SENTRY_CSP_REPORT_URI) {
    if (!meta) directives.push(`report-uri ${serverConfig.SENTRY_CSP_REPORT_URI}`);
    directives.push('report-to csp-endpoint');
  }
  if (meta) directives.push("script-src-attr 'none'");
  return directives.join('; ');
}

export function securityHeaders(publicConfig: PublicConfig, serverConfig: ServerConfig, development = false) {
  const headers = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(publicConfig, serverConfig, { development }) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ];
  if (publicConfig.NEXT_PUBLIC_SITE_URL.startsWith('https:'))
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
  if (serverConfig.SENTRY_CSP_REPORT_URI)
    headers.push({
      key: 'Report-To',
      value: JSON.stringify({
        group: 'csp-endpoint',
        max_age: 10886400,
        endpoints: [{ url: serverConfig.SENTRY_CSP_REPORT_URI }],
      }),
    });
  return headers;
}
