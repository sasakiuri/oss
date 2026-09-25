import { describe, expect, it } from 'vitest';

import { redactPath } from '@/lib/logging';
import { assertCronRequest, assertSameOrigin, bearerToken, readJsonBody, readTextBody } from '@/lib/server/guards';
import { RequestError } from '@/lib/server/http';
import { hashPassphrase, verifyPassphrase } from '@/lib/server/secrets';
import { createStoreProvider } from '@/lib/server/store';

const status = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof RequestError ? error.status : 'other';
  }
  return 'passed';
};

describe('assertSameOrigin', () => {
  const request = (origin?: string) =>
    new Request('https://about.nilay.jp/api/labs/x', { method: 'POST', headers: origin ? { origin } : {} });
  it('accepts the site origin and refuses others or none', () => {
    expect(status(() => assertSameOrigin(request('https://about.nilay.jp'), 'https://about.nilay.jp/'))).toBe('passed');
    expect(status(() => assertSameOrigin(request('https://evil.test'), 'https://about.nilay.jp'))).toBe(403);
    expect(status(() => assertSameOrigin(request('null'), 'https://about.nilay.jp'))).toBe(403);
    expect(status(() => assertSameOrigin(request(), 'https://about.nilay.jp'))).toBe(403);
  });
});

describe('request bodies', () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://about.nilay.jp/api', { method: 'POST', body, headers });

  it('reads JSON within the limit', async () => {
    expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({ a: 1 });
    await expect(readJsonBody(post('{'), 100)).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a body over the limit, whatever the declared length', async () => {
    await expect(readTextBody(post('x'.repeat(101)), 100)).rejects.toMatchObject({ status: 413 });
    await expect(readTextBody(post('x', { 'content-length': '5000' }), 100)).rejects.toMatchObject({ status: 413 });
    expect(await readTextBody(new Request('https://about.nilay.jp/api', { method: 'POST' }), 100)).toBe('');
  });
});

describe('assertCronRequest', () => {
  const request = (authorization?: string) =>
    new Request('https://about.nilay.jp/api/cron/x', { headers: authorization ? { authorization } : {} });
  const secret = 'a-cron-secret-of-32-characters!!';

  it('accepts only the configured bearer secret', () => {
    expect(status(() => assertCronRequest(request(`Bearer ${secret}`), secret))).toBe('passed');
    expect(status(() => assertCronRequest(request(`Bearer ${secret}x`), secret))).toBe(401);
    expect(status(() => assertCronRequest(request(secret), secret))).toBe(401);
    expect(status(() => assertCronRequest(request(), secret))).toBe(401);
  });

  it('refuses every call when no secret, or a short one, is configured', () => {
    expect(status(() => assertCronRequest(request('Bearer '), undefined))).toBe(401);
    expect(status(() => assertCronRequest(request('Bearer undefined'), undefined))).toBe(401);
    expect(status(() => assertCronRequest(request('Bearer short'), 'short'))).toBe(401);
  });
});

describe('bearerToken', () => {
  it('reads a well-formed token only', () => {
    const request = (authorization: string) => new Request('https://x.test', { headers: { authorization } });
    expect(bearerToken(request('Bearer abcdefghijklmnop_-12'))).toBe('abcdefghijklmnop_-12');
    expect(status(() => bearerToken(request('Bearer short')))).toBe(401);
    expect(status(() => bearerToken(request('Basic abcdefghijklmnopqrst')))).toBe(401);
  });
});

describe('passphrases', () => {
  it('are salted and verified', async () => {
    const first = await hashPassphrase('猟友会の合言葉');
    expect(first).toMatch(/^scrypt\$/);
    expect(await hashPassphrase('猟友会の合言葉')).not.toBe(first);
    expect(await verifyPassphrase('猟友会の合言葉', first)).toBe(true);
    expect(await verifyPassphrase('猟友会の合言', first)).toBe(false);
    expect(await verifyPassphrase('x', 'md5$abc')).toBe(false);
  });
});

describe('createStoreProvider', () => {
  it('answers 503 when Upstash is not configured instead of standing in', () => {
    const provider = createStoreProvider(() => ({}));
    expect(status(() => provider())).toBe(503);
  });
});

describe('redactPath', () => {
  it('hides webhook tokens and room and results ids, and nothing else', () => {
    expect(redactPath('/api/labs/hooks/abcDEF123_-xyz')).toBe('/api/labs/hooks/[id]');
    expect(redactPath('/api/labs/rooms/abcDEF123_-xyzabcdef12/join')).toBe('/api/labs/rooms/[id]/join');
    expect(redactPath('/api/labs/results/abcDEF123_-xyz12')).toBe('/api/labs/results/[id]');
    expect(redactPath('/labs/trajectory-truing')).toBe('/labs/trajectory-truing');
    expect(redactPath('/api/news/abc')).toBe('/api/news/abc');
  });
});
