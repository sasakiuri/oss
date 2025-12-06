/**
 * Server-side rate limiting for API routes
 *
 * Uses in-memory storage with LRU-style cleanup.
 * For production at scale, consider Redis-based rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limits
// Note: This is lost on server restart and not shared between instances
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
}

/**
 * Check rate limit for a given identifier (typically IP address)
 *
 * @param identifier - Unique identifier for the client (IP, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and metadata
 *
 * @example
 * ```ts
 * const result = checkRateLimit(clientIp, { maxRequests: 5, windowMs: 60000 });
 * if (!result.allowed) {
 *   return new Response("Too many requests", { status: 429 });
 * }
 * ```
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // No existing entry or window has expired
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(identifier, {
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
 * Get client IP from request headers
 * Handles various proxy headers for accurate IP detection
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  // Check common proxy headers
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take the first IP in the list (original client)
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Vercel-specific header
  const vercelForwardedFor = headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(",")[0].trim();
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
