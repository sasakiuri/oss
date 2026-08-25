// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { resolveDevServerUrl } from '@/main/infrastructure/window/resolveDevServerUrl';

describe('resolveDevServerUrl', () => {
  it('uses the configured server during development', () => {
    expect(resolveDevServerUrl(false, 'http://localhost:5173/')).toBe('http://localhost:5173/');
  });

  it('ignores the configured server in a packaged application', () => {
    expect(resolveDevServerUrl(true, 'https://example.com/')).toBeNull();
  });

  it('returns null when no server is configured', () => {
    expect(resolveDevServerUrl(false, undefined)).toBeNull();
  });
});
