import { describe, it, expect, vi } from 'vitest';

import { createRateLimiter, rateLimitPresets } from '@/lib/server/rate-limit';

const config = { maxRequests: 2, windowMs: 1000 };
const upstash = {
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'test-token',
};

describe('in-memory rate limiting', () => {
  it('counts allowed requests and resets at the exact expiry boundary', async () => {
    let timestamp = 100;
    const check = createRateLimiter({ environment: { NODE_ENV: 'test' }, now: () => timestamp });

    await expect(check('client', config)).resolves.toEqual({ allowed: true, remaining: 1, resetIn: 1000 });
    timestamp = 200;
    await expect(check('client', config)).resolves.toEqual({ allowed: true, remaining: 0, resetIn: 900 });
    timestamp = 1099;
    await expect(check('client', config)).resolves.toEqual({ allowed: false, remaining: 0, resetIn: 1 });
    timestamp = 1100;
    await expect(check('client', config)).resolves.toEqual({ allowed: true, remaining: 1, resetIn: 1000 });
  });

  it('isolates clients, policies and factory instances', async () => {
    const options = { environment: { NODE_ENV: 'test' }, now: () => 0 };
    const check = createRateLimiter(options);
    const strict = { maxRequests: 1, windowMs: 1000 };

    await check('client-a', strict);
    await expect(check('client-a', strict)).resolves.toMatchObject({ allowed: false });
    await expect(check('client-b', strict)).resolves.toMatchObject({ allowed: true });
    await expect(check('client-a', config)).resolves.toMatchObject({ allowed: true });
    await expect(check('client-a', { ...strict, windowMs: 2000 })).resolves.toMatchObject({ allowed: true });
    await expect(createRateLimiter(options)('client-a', strict)).resolves.toMatchObject({ allowed: true });
  });

  it.each([
    { maxRequests: 0, windowMs: 1000 },
    { maxRequests: 1.5, windowMs: 1000 },
    { maxRequests: 1, windowMs: 0 },
    { maxRequests: 1, windowMs: Number.NaN },
  ])('rejects invalid policy %j before accessing a backend', async (invalid) => {
    const createDistributedLimiter = vi.fn();
    const check = createRateLimiter({ createDistributedLimiter });
    await expect(check('client', invalid)).rejects.toThrow(RangeError);
    expect(createDistributedLimiter).not.toHaveBeenCalled();
  });
});

describe('distributed rate limiting', () => {
  it('initializes lazily and isolates Redis prefixes for different presets', async () => {
    const counters = new Map<string, number>();
    const createDistributedLimiter = vi.fn((policy, prefix) => ({
      limit: vi.fn(async (identifier: string) => {
        const key = `${prefix}:${identifier}`;
        const count = (counters.get(key) ?? 0) + 1;
        counters.set(key, count);
        return {
          success: count <= policy.maxRequests,
          remaining: Math.max(0, policy.maxRequests - count),
          reset: 2000,
        };
      }),
    }));
    const check = createRateLimiter({
      environment: { NODE_ENV: 'production', ...upstash },
      now: () => 1000,
      createDistributedLimiter,
    });
    expect(createDistributedLimiter).not.toHaveBeenCalled();

    for (let request = 0; request < rateLimitPresets.contact.maxRequests; request++) {
      await expect(check('client', rateLimitPresets.contact)).resolves.toMatchObject({ allowed: true });
    }
    await expect(check('client', rateLimitPresets.contact)).resolves.toMatchObject({ allowed: false });
    await expect(check('client', rateLimitPresets.apiRead)).resolves.toEqual({
      allowed: true,
      remaining: 59,
      resetIn: 1000,
    });
    expect(createDistributedLimiter).toHaveBeenCalledTimes(2);
    expect(createDistributedLimiter.mock.calls[0]?.[1]).not.toBe(createDistributedLimiter.mock.calls[1]?.[1]);
  });

  it('clamps expired distributed reset timestamps to zero', async () => {
    const check = createRateLimiter({
      environment: upstash,
      now: () => 2000,
      createDistributedLimiter: () => ({
        limit: async () => ({ success: false, remaining: 0, reset: 1000 }),
      }),
    });
    await expect(check('client', config)).resolves.toEqual({ allowed: false, remaining: 0, resetIn: 0 });
  });

  it.each(['missing', 'incomplete'] as const)(
    'permits production requests with %s configuration and warns once',
    async (mode) => {
      const warn = vi.fn();
      const check = createRateLimiter({
        environment: {
          NODE_ENV: 'production',
          ...(mode === 'incomplete' && { UPSTASH_REDIS_REST_URL: upstash.UPSTASH_REDIS_REST_URL }),
        },
        warn,
      });
      await expect(check('client', config)).resolves.toEqual({ allowed: true, remaining: 2, resetIn: 0 });
      await check('client', config);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it.each(['production', 'development', 'test'])('handles Redis failures using the %s policy', async (environment) => {
    const error = vi.fn();
    const failure = new Error('Redis unavailable');
    const check = createRateLimiter({
      environment: { NODE_ENV: environment, ...upstash },
      error,
      now: () => 0,
      createDistributedLimiter: () => ({
        limit: async () => {
          throw failure;
        },
      }),
    });
    const strict = { maxRequests: 1, windowMs: 1000 };
    await expect(check('client', strict)).resolves.toMatchObject({ allowed: true });
    await expect(check('client', strict)).resolves.toMatchObject({ allowed: environment === 'production' });
    expect(error).toHaveBeenCalledWith('Upstash rate limit request failed', failure);
  });

  it('handles constructor failures through the same production policy', async () => {
    const error = vi.fn();
    const check = createRateLimiter({
      environment: { NODE_ENV: 'production', ...upstash },
      error,
      createDistributedLimiter: () => {
        throw new Error('Invalid Redis configuration');
      },
    });
    await expect(check('client', config)).resolves.toEqual({ allowed: true, remaining: 2, resetIn: 0 });
    expect(error).toHaveBeenCalledOnce();
  });

  it('uses local counters when Upstash returns its timeout result in development', async () => {
    const error = vi.fn();
    const check = createRateLimiter({
      environment: { NODE_ENV: 'development', ...upstash },
      error,
      createDistributedLimiter: () => ({
        limit: async () => ({ success: true, remaining: 1, reset: 0, reason: 'timeout' }),
      }),
    });
    const strict = { maxRequests: 1, windowMs: 1000 };
    await check('client', strict);
    await expect(check('client', strict)).resolves.toMatchObject({ allowed: false });
    expect(error).toHaveBeenCalled();
  });
});
