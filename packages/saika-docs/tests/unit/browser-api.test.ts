// SPDX-License-Identifier: MIT
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { browserApi } from '../../src/shared/api/browser-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.cookie = 'saika_csrf=; Max-Age=0';
});
it('sends cookies and CSRF tokens only for unsafe methods', async () => {
  document.cookie = 'saika_csrf=fixture%2Btoken';
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
  vi.stubGlobal('fetch', fetch);
  await browserApi('/user', z.unknown(), { redirectOnUnauthorized: '/reference/' });
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  await browserApi('/catalog', z.unknown(), { method: 'POST' });
  expect(fetch.mock.calls[1]?.[1].headers['x-csrf-token']).toBe('fixture+token');
});
it('allows API requests to opt out of automatic unauthorized redirects', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { assign, pathname: '/getting-started/', search: '' } });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(Response.json({ title: 'Required' }, { status: 401 }))),
  );
  await expect(browserApi('/catalog', z.unknown(), { redirectOnUnauthorized: undefined })).rejects.toMatchObject({
    status: 401,
  });
  expect(assign).not.toHaveBeenCalled();
  await expect(browserApi('/user', z.unknown(), { redirectOnUnauthorized: '/reference/' })).rejects.toMatchObject({
    status: 401,
  });
  expect(assign).toHaveBeenCalledWith('/reference/');
});
