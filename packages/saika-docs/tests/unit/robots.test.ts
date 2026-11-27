// SPDX-License-Identifier: MIT
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import robots from '@/app/robots';
import { absoluteUrl } from '@/shared/config/site';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('robots.txt', () => {
  it.each(['server', 'standalone', 'export'])('lists only the sitemap the site serves in %s output', (output) => {
    vi.stubEnv('DOCS_OUTPUT', output);
    expect([robots().sitemap].flat()).toEqual([absoluteUrl('/sitemap.xml')]);
  });
});
