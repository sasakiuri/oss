import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createRequestLogger } from '@/lib/logging';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Build Content Security Policy header
 *
 * Note: 'unsafe-inline' is required for Next.js RSC inline scripts.
 * Nonce-based CSP requires dynamic rendering for all pages, which is not
 * practical for this application. See: https://nextjs.org/docs/app/guides/content-security-policy
 */
function buildCSPHeader(request: NextRequest): string {
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is required for Next.js hydration scripts
    // 'wasm-unsafe-eval' lets the page compile WebAssembly, which /labs/photo-measure needs to run its
    // outline model on the device. It allows WebAssembly only, not JavaScript eval.
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
    // cyberjapandata.gsi.go.jp serves the GSI map tiles the Labs field tools show (地理院タイル).
    "img-src 'self' blob: data: https://cdn.nilay.jp https://www.irasutoya.com https://images.microcms-assets.io https://cyberjapandata.gsi.go.jp",
    "font-src 'self' https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // huggingface.co and its CDN (*.hf.co) serve the outline model /labs/photo-measure fetches on request.
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://gunman.nilay.jp wss://*.firebaseio.com https://huggingface.co https://*.hf.co",
  ];

  // WebKit upgrades loopback assets too, which breaks the local HTTP server.
  // A proxy may give Next.js an internal loopback URL for a public request.
  const loopbackAuthority = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isLocalHttp =
    request.nextUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname) &&
    loopbackAuthority.test(request.headers.get('host') ?? '') &&
    !request.headers.has('forwarded') &&
    (forwardedHost === null || forwardedHost.split(',').every((host) => loopbackAuthority.test(host.trim()))) &&
    (forwardedProto === null || forwardedProto.split(',').every((proto) => proto.trim() === 'http'));
  if (!isLocalHttp) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const cspHeader = buildCSPHeader(request);

  // 本番環境では CSP を強制、それ以外は Report-Only モード
  if (isProduction) {
    response.headers.set('Content-Security-Policy', cspHeader);
  } else {
    response.headers.set('Content-Security-Policy-Report-Only', cspHeader);
  }

  if (!isProduction) createRequestLogger(request).info('Page request');

  return response;
}

/**
 * Matcher configuration
 * Excludes static files and API routes from proxy processing
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images/).*)',
  ],
};
