// SPDX-License-Identifier: MIT
// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { safeReturnTo } from '@/shared/api/auth';
import { apiPath, fetchJson, parseApiResponse, readLimitedBody } from '@/shared/api/http';
import { toQueryString } from '@/shared/api/query';

vi.mock('server-only', () => ({}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const json = (value: unknown, status = 200) => Response.json(value, { status });

describe('HTTP boundary', () => {
  it('validates success, empty success and Problem responses', async () => {
    await expect(parseApiResponse(json({ id: 'one' }), z.object({ id: z.string() }))).resolves.toEqual({ id: 'one' });
    await expect(parseApiResponse(new Response(null, { status: 204 }), z.undefined())).resolves.toBeUndefined();
    await expect(parseApiResponse(json({ title: 'Expired', code: 'session' }, 401), z.unknown())).rejects.toMatchObject(
      { status: 401, code: 'session', message: 'Expired' },
    );
    await expect(parseApiResponse(json({ id: 1 }), z.object({ id: z.string() }))).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(
      parseApiResponse(new Response('oops', { headers: { 'Content-Type': 'application/json' } }), z.unknown()),
    ).rejects.toMatchObject({ code: 'invalid_json' });
    await expect(parseApiResponse(new Response('<html>'), z.unknown())).rejects.toMatchObject({
      code: 'invalid_content_type',
    });
  });
  it('caps UTF-8 bytes, cancels oversized streams and bounds a stalled response body', async () => {
    const cancel = vi.fn();
    const bytes = new TextEncoder().encode('日本語');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
      },
      cancel,
    });
    await expect(readLimitedBody(stream, 8)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{'));
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    await expect(fetchJson('https://example.test', z.unknown(), {}, 20)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await expect(readLimitedBody(null)).resolves.toEqual(new Uint8Array());
  });
  it.each([
    '//evil.test/',
    '/..%2fsecret',
    '/a/../b',
    '/%2e/b',
    '/a\\b',
    '/%00',
    '/bad%xx',
    'https://evil.test',
    '/a#x',
  ])('rejects an unsafe API path %s', (path) => expect(() => apiPath(path)).toThrow());
  it('encodes query values and keeps safe relative return URLs', () => {
    expect(apiPath('/catalog?q=https%3A%2F%2Fexample.test')).toContain('?q=');
    expect(toQueryString({ q: '日 本', tag: ['one', 'two'], page: 2, empty: undefined })).toBe(
      '?q=%E6%97%A5+%E6%9C%AC&tag=one&tag=two&page=2',
    );
    expect(safeReturnTo('//evil.test')).toBe('/');
    expect(safeReturnTo('/reference/?q=1')).toBe('/reference/?q=1');
  });
});
