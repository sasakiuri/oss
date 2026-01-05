import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sanitizeForLogging } from "@/lib/security/sanitize.edge";

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

const isProduction = process.env.NODE_ENV === "production";

/**
 * Generate a random nonce for CSP
 *
 * Note: Uses Web Crypto API only for Edge Runtime compatibility.
 * Buffer is not available in Edge Runtime.
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  // Edge Runtime では Buffer が使えないため、Web API で base64 エンコード
  return btoa(String.fromCharCode(...array));
}

/**
 * Build Content Security Policy header
 *
 * Note: 'unsafe-inline' is required for Next.js RSC inline scripts.
 * Nonce-based CSP requires dynamic rendering for all pages, which is not
 * practical for this application. See: https://nextjs.org/docs/app/guides/content-security-policy
 */
function buildCSPHeader(_nonce: string): string {
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is required for Next.js hydration scripts
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
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

  // 本番環境では report-uri を追加（違反レポートの収集用）
  // TODO: Sentry CSP レポート URL などを設定する
  // if (isProduction && process.env.CSP_REPORT_URI) {
  //   directives.push(`report-uri ${process.env.CSP_REPORT_URI}`);
  // }

  return directives.join("; ");
}

/**
 * 構造化ログ形式でリクエストをログ出力（開発環境用）
 *
 * PII/トークンはマスキングされます。
 */
function logRequest(request: NextRequest): void {
  const { pathname } = request.nextUrl;
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());

  // 構造化ログ形式で出力（マスキング適用）
  const logEntry = sanitizeForLogging({
    timestamp: new Date().toISOString(),
    level: "info",
    method: request.method,
    path: pathname,
    query: Object.keys(searchParams).length > 0 ? searchParams : undefined,
  });

  console.log(JSON.stringify(logEntry));
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Generate nonce for CSP (for future script nonce support)
  const nonce = generateNonce();

  // Build and set CSP header
  // Note: Currently using 'unsafe-inline' for styles due to Tailwind CSS.
  // For production, consider using hash-based or nonce-based approach.
  const cspHeader = buildCSPHeader(nonce);

  // 本番環境では CSP を強制、それ以外は Report-Only モード
  if (isProduction) {
    response.headers.set("Content-Security-Policy", cspHeader);
  } else {
    response.headers.set("Content-Security-Policy-Report-Only", cspHeader);
  }

  // Store nonce for potential use in Server Components
  response.headers.set("x-nonce", nonce);

  // Log requests in development (構造化ログ、PIIマスキング済み)
  if (!isProduction) {
    logRequest(request);
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
