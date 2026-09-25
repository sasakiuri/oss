import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

import { withCronLock } from '@/features/labs-notify/server/cron-lock';
import { fetchPublicText } from '@/features/labs-notify/server/fetch-source';

import { createFakeUpstash, installFakeUpstash } from './fake-upstash';

describe('fetchPublicText (M6)', () => {
  const stream = (chunks: number, size: number) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < chunks; i += 1) controller.enqueue(new Uint8Array(size).fill(97));
        controller.close();
      },
    });
  const options = (fetch: typeof globalThis.fetch) => ({ fetch, maxBytes: 1000, mediaTypes: ['text/csv'] });

  it('stops reading at the cap when no length is declared', async () => {
    const body = stream(20, 100);
    const cancel = vi.spyOn(body, 'getReader');
    const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/csv' } }));
    await expect(fetchPublicText('https://x.test/a.csv', {}, options(fetch))).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalled();
  });

  it('refuses an unexpected media type and reads an expected one', async () => {
    const html = vi.fn().mockResolvedValue(new Response('<p>', { headers: { 'content-type': 'text/html' } }));
    await expect(fetchPublicText('https://x.test/a.csv', {}, options(html))).rejects.toThrow('media type');
    const csv = vi
      .fn()
      .mockResolvedValue(new Response('a,b', { headers: { 'content-type': 'text/csv; charset=utf-8' } }));
    expect(await fetchPublicText('https://x.test/a.csv', {}, options(csv))).toMatchObject({
      status: 'changed',
      text: 'a,b',
    });
  });
});

describe('withCronLock (n12)', () => {
  it('does not release a lock another run took after this run’s lock expired', async () => {
    let clock = 0;
    const fake = createFakeUpstash(() => clock);
    installFakeUpstash(fake);
    const store = fake.store();
    await withCronLock(store, 'job', 60, async () => {
      clock += 61_000;
      // The lock expired; a second run takes it.
      expect(await store.set('labs:lock:job', 'other', { ttlSeconds: 60, onlyIfAbsent: true })).toBe(true);
    });
    expect(await store.get('labs:lock:job')).toBe('other');
  });
});
