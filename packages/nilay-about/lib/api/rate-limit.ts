/**
 * Server-side rate limiting for API routes
 *
 * ## 実装概要
 *
 * 本番環境（Upstash設定あり）では Redis ベースの分散レートリミット、
 * 開発環境ではインメモリのフォールバックを使用します。
 *
 * ## 本番環境の設定
 *
 * 以下の環境変数を設定してください：
 * - `UPSTASH_REDIS_REST_URL`: Upstash Redis の REST URL
 * - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis の REST トークン
 *
 * ## 使用例
 *
 * ```ts
 * const clientIp = getClientIp(request);
 * const result = await checkRateLimit(clientIp, rateLimitPresets.contact);
 * if (!result.allowed) {
 *   return new Response("Too many requests", { status: 429 });
 * }
 * ```
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Time (in ms) until the rate limit resets */
  resetIn: number;
  /** Error message if rate limiting service failed (production only) */
  error?: string;
}

// Upstash Redis 設定チェック
const hasUpstashConfig =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

// Redis クライアント（本番環境用）
let redis: Redis | null = null;
if (hasUpstashConfig) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

// Upstash Ratelimit インスタンスのキャッシュ
const ratelimiters = new Map<string, Ratelimit>();

/**
 * Upstash Ratelimit インスタンスを取得または作成
 */
function getUpstashRatelimiter(config: RateLimitConfig): Ratelimit {
  const key = `${config.maxRequests}-${config.windowMs}`;

  if (!ratelimiters.has(key)) {
    // windowMs をミリ秒から秒に変換（Upstash は秒単位）
    const windowSec = Math.ceil(config.windowMs / 1000);

    ratelimiters.set(
      key,
      new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(config.maxRequests, `${windowSec} s`),
        analytics: true,
        prefix: "ratelimit:about",
      })
    );
  }

  return ratelimiters.get(key)!;
}

// ============================================
// インメモリフォールバック（開発環境用）
// ============================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limits (development fallback)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * インメモリでのレートリミットチェック（開発環境用フォールバック）
 *
 * キーには identifier と config の両方を含めることで、
 * 異なるプリセット（contact, apiRead 等）が独立して動作するようにする。
 */
function checkRateLimitInMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanup();

  // 設定値をキーに含めることで、異なるプリセットが独立したカウンタを持つ
  const key = `${identifier}:${config.maxRequests}:${config.windowMs}`;

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No existing entry or window has expired
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowMs,
    };
  }

  // Within current window
  const remaining = Math.max(0, config.maxRequests - entry.count - 1);
  const resetIn = entry.resetTime - now;

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn,
    };
  }

  // Increment count
  entry.count += 1;
  return {
    allowed: true,
    remaining,
    resetIn,
  };
}

/**
 * Check rate limit for a given identifier (typically IP address)
 *
 * - 本番環境: Upstash Redis を使用（必須）
 * - 開発/テスト環境: Upstash 未設定時はインメモリにフォールバック
 *
 * @param identifier - Unique identifier for the client (IP, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and metadata
 * @throws ConfigurationError in production if Upstash is not configured
 *
 * @example
 * ```ts
 * const result = await checkRateLimit(clientIp, { maxRequests: 5, windowMs: 60000 });
 * if (!result.allowed) {
 *   return new Response("Too many requests", { status: 429 });
 * }
 * ```
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const isProduction = process.env.NODE_ENV === "production";

  // Upstash が設定されていない場合
  if (!hasUpstashConfig || !redis) {
    if (isProduction) {
      // 本番環境では Upstash 必須 - リクエストを拒否
      console.error(
        "[rate-limit] CRITICAL: Upstash is not configured in production. " +
          "Rate limiting is disabled. Rejecting request for security. " +
          "Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
      );
      return {
        allowed: false,
        remaining: 0,
        resetIn: 60000, // 1 minute
        error: "Rate limiting service unavailable",
      };
    }
    // 開発/テスト環境ではインメモリにフォールバック
    return checkRateLimitInMemory(identifier, config);
  }

  try {
    const ratelimiter = getUpstashRatelimiter(config);
    const { success, remaining, reset } = await ratelimiter.limit(identifier);

    return {
      allowed: success,
      remaining,
      resetIn: Math.max(0, reset - Date.now()),
    };
  } catch (error) {
    console.error("[rate-limit] Upstash error:", error);

    if (isProduction) {
      // 本番環境では Redis エラー時もリクエストを拒否
      // セキュリティを優先し、レートリミットなしでの通過を許可しない
      return {
        allowed: false,
        remaining: 0,
        resetIn: 60000, // 1 minute
        error: "Rate limiting service error",
      };
    }

    // 開発/テスト環境ではインメモリにフォールバック（サービス継続性を優先）
    return checkRateLimitInMemory(identifier, config);
  }
}

/**
 * Get client IP from request headers
 *
 * プラットフォームが保証するヘッダを優先的に使用します。
 *
 * 優先順位:
 * 1. x-vercel-forwarded-for (Vercelが保証)
 * 2. cf-connecting-ip (Cloudflareが保証)
 * 3. x-real-ip (プロキシ設定次第)
 * 4. x-forwarded-for (最も一般的だが偽装可能)
 *
 * @param request - HTTPリクエスト
 * @returns クライアントIPアドレス
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  // Vercel-specific header (trusted, set by Vercel)
  const vercelForwardedFor = headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    const firstIp = vercelForwardedFor.split(",")[0];
    if (firstIp) return firstIp.trim();
  }

  // Cloudflare-specific header (trusted, set by Cloudflare)
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // x-real-ip (set by nginx/proxy, trust depends on config)
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // x-forwarded-for (standard but can be spoofed)
  // NOTE: Only trust this when behind a trusted proxy
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take the first IP in the list (original client)
    const firstIp = forwardedFor.split(",")[0];
    if (firstIp) return firstIp.trim();
  }

  // Fallback for development
  return "127.0.0.1";
}

/**
 * Rate limit presets for common use cases
 */
export const rateLimitPresets = {
  /** Contact form: 5 requests per minute */
  contact: { maxRequests: 5, windowMs: 60 * 1000 },
  /** API read: 60 requests per minute */
  apiRead: { maxRequests: 60, windowMs: 60 * 1000 },
  /** API write: 20 requests per minute */
  apiWrite: { maxRequests: 20, windowMs: 60 * 1000 },
  /** Strict: 3 requests per minute (for sensitive operations) */
  strict: { maxRequests: 3, windowMs: 60 * 1000 },
} as const;
