import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Middleware
 *
 * Handles:
 * 1. Security headers enhancement (CSP preparation)
 * 2. Request logging (development)
 * 3. Rate limiting preparation
 *
 * Note: CSP with nonce requires Server Components integration.
 * For now, we prepare the infrastructure.
 */

/**
 * Generate a random nonce for CSP
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString("base64");
}

/**
 * Build Content Security Policy header
 */
function buildCSPHeader(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com`,
    "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
    "img-src 'self' blob: data: https://cdn.nilay.jp https://www.irasutoya.com",
    "font-src 'self' https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://gunman.nilay.jp wss://*.firebaseio.com",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Generate nonce for CSP (for future script nonce support)
  const nonce = generateNonce();

  // Build and set CSP header
  // Note: Currently using 'unsafe-inline' for styles due to Tailwind CSS.
  // For production, consider using hash-based or nonce-based approach.
  const cspHeader = buildCSPHeader(nonce);

  // Set CSP header (Report-Only mode for testing)
  // Change to "Content-Security-Policy" when ready for enforcement
  response.headers.set("Content-Security-Policy-Report-Only", cspHeader);

  // Store nonce for potential use in Server Components
  response.headers.set("x-nonce", nonce);

  // Log requests in development
  if (process.env.NODE_ENV === "development") {
    const { pathname, search } = request.nextUrl;
    console.log(`[${new Date().toISOString()}] ${request.method} ${pathname}${search}`);
  }

  return response;
}

/**
 * Matcher configuration
 * Excludes static files and API routes from middleware processing
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
    "/((?!api|_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
