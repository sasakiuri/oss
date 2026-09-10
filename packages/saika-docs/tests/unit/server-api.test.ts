// SPDX-License-Identifier: MIT
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => 'saika_session=fixture' }) }));
vi.mock('next/server', () => ({ after: (callback: () => void) => callback() }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn() }));
vi.mock('../../src/shared/telemetry/server/logger', () => ({ logger }));
import { ApiError } from '../../src/shared/api/http';
import { serverApi } from '../../src/shared/api/server/client';
import { enforceRateLimit } from '../../src/shared/api/server/rate-limit';
import { apiResponse } from '../../src/shared/api/server/response';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('forwards session cookies without caching and fails closed when unconfigured', async () => {
  vi.stubEnv('API_BASE_URL', '');
  await expect(serverApi('/user', z.unknown())).rejects.toMatchObject({ status: 503 });
  vi.stubEnv('API_BASE_URL', 'https://api.example.test');
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: '1' }));
  vi.stubGlobal('fetch', fetch);
  expect(await serverApi('/user', z.object({ id: z.string() }))).toEqual({ id: '1' });
  expect(fetch.mock.calls[0]?.[0]).toBe('https://api.example.test/api/user');
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', headers: { cookie: 'saika_session=fixture' } });
});
it('captures unexpected failures and flushes logs, while expected client failures remain warnings', async () => {
  expect((await apiResponse(async () => ({ status: 'ok' }))).headers.get('Cache-Control')).toContain('s-maxage');
  expect((await apiResponse(async () => ({}), 'private')).headers.get('Cache-Control')).toBe('private, no-store');
  const unexpected = new Error('internal secret');
  const failure = await apiResponse(() => Promise.reject(unexpected));
  expect(failure.status).toBe(502);
  expect(await failure.text()).not.toContain('internal secret');
  expect(logger.error).toHaveBeenCalledWith('api_failure', unexpected, expect.objectContaining({ status: 502 }));
  const denied = await apiResponse(() => Promise.reject(new ApiError(403, 'Forbidden')));
  expect(denied.status).toBe(403);
  expect(logger.warn).toHaveBeenCalled();
  const timeout = await apiResponse(() => Promise.reject(new DOMException('timeout', 'TimeoutError')));
  expect(timeout.status).toBe(504);
  expect(logger.flush).toHaveBeenCalledTimes(5);
});
it('enforces distributed throttling and returns retry headers without failing open', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  await expect(enforceRateLimit('user')).rejects.toMatchObject({ status: 503, code: 'limiter_disabled' });
  const limited = await enforceRateLimit('user', {
    limit: async () => ({ success: false, remaining: 0, reset: Date.now() + 15000 }),
  });
  expect(limited.allowed).toBe(false);
  expect(Number(limited.headers['Retry-After'])).toBeGreaterThan(0);
  expect(
    (
      await enforceRateLimit('user', {
        limit: async () => ({ success: true, remaining: 19, reset: Date.now() + 60000 }),
      })
    ).headers,
  ).not.toHaveProperty('Retry-After');
  await expect(enforceRateLimit('user', { limit: () => Promise.reject(new Error('network')) })).rejects.toMatchObject({
    status: 503,
    code: 'limiter_unavailable',
  });
});
