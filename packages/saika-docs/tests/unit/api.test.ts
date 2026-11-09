// SPDX-License-Identifier: MIT
// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { safeReturnTo } from '@/shared/api/auth';
import { ApiError, apiPath, fetchJson, parseApiResponse, readLimitedBody } from '@/shared/api/http';
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

describe('HTTP error and cancellation contracts', () => {
  it('preserves typed errors and bounded problem details', async () => {
    const error = new ApiError(400, 'Bad request');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'ApiError', status: 400, message: 'Bad request', code: 'request_failed' });
    for (const body of [{}, { title: 'x'.repeat(301) }, { code: 'x'.repeat(101) }, 'problem']) {
      await expect(parseApiResponse(json(body, 400), z.unknown())).rejects.toMatchObject({
        status: 400,
        message: 'The API request failed.',
        code: 'request_failed',
      });
    }
    await expect(
      parseApiResponse(json({ title: 'x'.repeat(300), code: 'y'.repeat(100) }, 400), z.unknown()),
    ).rejects.toMatchObject({ message: 'x'.repeat(300), code: 'y'.repeat(100) });
    await expect(parseApiResponse(new Response('bad', { status: 403 }), z.unknown())).rejects.toMatchObject({
      status: 403,
      message: 'The API did not return JSON.',
      code: 'invalid_content_type',
    });
    await expect(parseApiResponse(new Response('bad'), z.unknown())).rejects.toMatchObject({
      status: 502,
      message: 'The API did not return JSON.',
    });
    await expect(
      parseApiResponse(new Response('{', { headers: { 'content-type': 'application/json' } }), z.unknown()),
    ).rejects.toMatchObject({ status: 502, message: 'The API returned invalid JSON.', code: 'invalid_json' });
    await expect(parseApiResponse(json({}), z.string())).rejects.toMatchObject({
      status: 502,
      message: 'The API response did not match its contract.',
      code: 'invalid_response',
    });
    await expect(parseApiResponse(new Response(''), z.undefined())).resolves.toBeUndefined();
    await expect(parseApiResponse(new Response(null, { status: 401 }), z.unknown())).rejects.toMatchObject({
      status: 401,
      code: 'request_failed',
    });
  });

  it('assembles chunks exactly at the byte limit and always releases the reader', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });
    const signal = new AbortController().signal;
    const add = vi.spyOn(signal, 'addEventListener');
    const remove = vi.spyOn(signal, 'removeEventListener');
    await expect(readLimitedBody(stream, 3, signal)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(stream.locked).toBe(false);
    expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_001));
      },
    });
    await expect(readLimitedBody(oversized)).rejects.toMatchObject({
      status: 413,
      message: 'The request or response is too large.',
      code: 'body_too_large',
    });
    expect(oversized.locked).toBe(false);
  });

  it('cancels a pending read with the caller reason and rejects already aborted requests', async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const result = readLimitedBody(stream, 100, controller.signal);
    const reason = new Error('navigation');
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason);
    expect(stream.locked).toBe(false);
    await expect(readLimitedBody(new ReadableStream(), 100, controller.signal)).rejects.toBe(reason);
  });

  it('keeps caller options, headers and cancellation when fetching JSON', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const url = new URL('https://example.test/api');
    await expect(
      fetchJson(url, z.object({ ok: z.boolean() }), {
        method: 'POST',
        body: '{}',
        headers: { 'X-Test': 'yes' },
        signal: controller.signal,
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(url, {
      method: 'POST',
      body: '{}',
      headers: { Accept: 'application/json', 'x-test': 'yes' },
      signal: expect.any(AbortSignal),
    });
    const combined = fetch.mock.calls[0]![1]!.signal as AbortSignal;
    controller.abort('cancelled');
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('cancelled');
    await expect(fetchJson('https://example.test', z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[1]![1]!.headers).toEqual({ Accept: 'application/json' });
  });

  it.each(['/%252e/', '/a b', '/a%23b', '/a%5cb', ''])('rejects unsafe path %j with a stable error', (path) => {
    expect(() => apiPath(path)).toThrow(expect.objectContaining({ status: 400, message: 'Invalid API path.' }));
  });

  it('preserves a safe path and its encoded query verbatim', () => {
    expect(apiPath('/catalog?q=a%2Fb')).toBe('/catalog?q=a%2Fb');
  });
});
