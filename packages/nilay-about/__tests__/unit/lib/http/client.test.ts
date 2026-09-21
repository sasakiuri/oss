import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { fetchNewsById } from '@/features/news/client';
import { HttpError, requestJson, ResponseValidationError, shouldRetryQuery } from '@/lib/http/client';

const schema = z.object({ ok: z.boolean() });
afterEach(() => vi.unstubAllGlobals());

describe('JSON transport', () => {
  it('returns validated response data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await expect(requestJson('/api/test', schema)).resolves.toEqual({ ok: true });
  });

  it('preserves the HTTP status even when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>Unavailable</h1>', { status: 503 })));
    await expect(requestJson('/api/test', schema)).rejects.toMatchObject({ status: 503 });
  });

  it.each([Response.json({ ok: 'invalid' }), new Response('not json')])(
    'distinguishes invalid responses from network failures',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(requestJson('/api/test', schema)).rejects.toBeInstanceOf(ResponseValidationError);
    },
  );

  it('propagates cancellation without turning it into a server failure', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(requestJson('/api/test', schema)).rejects.toBe(abort);
    expect(shouldRetryQuery(0, abort)).toBe(false);
  });

  it('encodes news identifiers and forwards the query cancellation signal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ news: { id: 'a/b', title: '', summary: '', date: '2026-01-01' } }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    await fetchNewsById('a/b?#', controller.signal);
    expect(fetch).toHaveBeenCalledWith('/api/news/a%2Fb%3F%23', { signal: controller.signal });
  });

  it('retries transient failures but not client errors or malformed responses', () => {
    expect(shouldRetryQuery(0, new HttpError(404, 'Missing'))).toBe(false);
    expect(shouldRetryQuery(0, new HttpError(429, 'Limited'))).toBe(false);
    expect(shouldRetryQuery(0, new ResponseValidationError('/api/test', null))).toBe(false);
    expect(shouldRetryQuery(0, new HttpError(503, 'Unavailable'))).toBe(true);
    expect(shouldRetryQuery(2, new TypeError('Failed to fetch'))).toBe(false);
  });
});
