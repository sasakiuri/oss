// SPDX-License-Identifier: MIT
import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { readServerEnv } from '../../config/env';
import { ApiError } from '../http';

export type Limiter = {
  limit: (identifier: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
};
let remote: Limiter | undefined;
export async function enforceRateLimit(identifier: string, supplied?: Limiter) {
  if (!supplied && !remote) {
    const env = readServerEnv();
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)
      throw new ApiError(503, 'Rate limiting is not configured.', 'limiter_disabled');
    remote = new Ratelimit({
      redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
      limiter: Ratelimit.slidingWindow(20, '1 m'),
      analytics: false,
      prefix: 'saika-docs',
    });
  }
  let result;
  try {
    result = await (supplied ?? remote!).limit(identifier);
  } catch {
    throw new ApiError(503, 'Rate limiting is unavailable.', 'limiter_unavailable');
  }
  return {
    allowed: result.success,
    headers: {
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
      ...(result.success ? {} : { 'Retry-After': String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))) }),
    },
  };
}
