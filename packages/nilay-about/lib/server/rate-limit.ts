import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { logger } from '@/lib/logging';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetIn: number;
}

interface DistributedLimiter {
  limit(identifier: string): Promise<{
    success: boolean;
    remaining: number;
    reset: number;
    reason?: string;
  }>;
}

interface RateLimitEnvironment {
  NODE_ENV?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

interface RateLimiterOptions {
  environment?: RateLimitEnvironment;
  now?: () => number;
  createDistributedLimiter?: (
    config: RateLimitConfig,
    prefix: string,
    credentials: { url: string; token: string },
  ) => DistributedLimiter;
  warn?: (message: string) => void;
  error?: (message: string, error: Error) => void;
}

function createUpstashLimiter(
  config: RateLimitConfig,
  prefix: string,
  credentials: { url: string; token: string },
): DistributedLimiter {
  return new Ratelimit({
    redis: new Redis(credentials),
    limiter: Ratelimit.slidingWindow(config.maxRequests, `${Math.ceil(config.windowMs / 1000)} s`),
    analytics: true,
    prefix,
  });
}

/**
 * Each instance owns its counters and initializes external clients on first use.
 * Production deliberately permits requests when Upstash is missing or unavailable;
 * development/test use local fixed windows in those cases.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const now = options.now ?? Date.now;
  const createDistributedLimiter = options.createDistributedLimiter ?? createUpstashLimiter;
  const warn = options.warn ?? logger.warn;
  const error = options.error ?? logger.error;
  const counters = new Map<string, { count: number; resetTime: number }>();
  const distributedLimiters = new Map<string, DistributedLimiter>();
  let lastCleanup = 0;
  let warnedAboutMissingConfig = false;

  function checkInMemory(identifier: string, config: RateLimitConfig, configKey: string): RateLimitResult {
    const timestamp = now();
    if (timestamp - lastCleanup >= 5 * 60 * 1000) {
      for (const [key, entry] of counters) {
        if (entry.resetTime <= timestamp) counters.delete(key);
      }
      lastCleanup = timestamp;
    }

    const key = JSON.stringify([configKey, identifier]);
    let entry = counters.get(key);
    if (!entry || entry.resetTime <= timestamp) {
      entry = { count: 0, resetTime: timestamp + config.windowMs };
      counters.set(key, entry);
    }

    const allowed = entry.count < config.maxRequests;
    if (allowed) entry.count += 1;
    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetIn: entry.resetTime - timestamp,
    };
  }

  return async function checkRateLimit(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
    if (!Number.isSafeInteger(config.maxRequests) || config.maxRequests <= 0) {
      throw new RangeError('maxRequests must be a positive integer');
    }
    if (!Number.isSafeInteger(config.windowMs) || config.windowMs <= 0) {
      throw new RangeError('windowMs must be a positive integer');
    }

    const environment = options.environment ?? process.env;
    const production = environment.NODE_ENV === 'production';
    const url = environment.UPSTASH_REDIS_REST_URL;
    const token = environment.UPSTASH_REDIS_REST_TOKEN;
    const configKey = `${config.maxRequests}:${config.windowMs}`;
    const permitRequest = (): RateLimitResult => ({
      allowed: true,
      remaining: config.maxRequests,
      resetIn: 0,
    });

    if (!url || !token) {
      if (!production) return checkInMemory(identifier, config, configKey);
      if (!warnedAboutMissingConfig) {
        warn('Upstash is not configured; production rate limiting is disabled.');
        warnedAboutMissingConfig = true;
      }
      return permitRequest();
    }

    try {
      let limiter = distributedLimiters.get(configKey);
      if (!limiter) {
        // The Redis prefix must be isolated as well as the local instance cache.
        limiter = createDistributedLimiter(config, `ratelimit:about:${configKey}`, { url, token });
        distributedLimiters.set(configKey, limiter);
      }
      const result = await limiter.limit(identifier);
      if (result.reason === 'timeout') throw new Error('Upstash rate limit request timed out');
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetIn: Math.max(0, result.reset - now()),
      };
    } catch (cause) {
      error('Upstash rate limit request failed', cause instanceof Error ? cause : new Error(String(cause)));
      return production ? permitRequest() : checkInMemory(identifier, config, configKey);
    }
  };
}

export const checkRateLimit = createRateLimiter();

export const rateLimitPresets = {
  contact: { maxRequests: 5, windowMs: 60 * 1000 },
  apiRead: { maxRequests: 60, windowMs: 60 * 1000 },
  apiWrite: { maxRequests: 20, windowMs: 60 * 1000 },
  strict: { maxRequests: 3, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateLimitConfig>;
