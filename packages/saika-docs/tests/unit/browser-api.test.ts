// SPDX-License-Identifier: MIT
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { browserApi } from '../../src/shared/api/browser-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('requests the site API with same-origin credentials', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
  vi.stubGlobal('fetch', fetch);
  await expect(browserApi('/catalog/', z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true });
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/catalog/');
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
});
it('rejects unauthorized responses with their status', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(Response.json({ title: 'Required' }, { status: 401 }))),
  );
  await expect(browserApi('/catalog/', z.unknown())).rejects.toMatchObject({ status: 401, message: 'Required' });
});
