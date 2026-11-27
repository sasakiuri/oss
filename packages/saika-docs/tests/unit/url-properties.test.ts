// SPDX-License-Identifier: MIT
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { apiPath } from '../../src/shared/api/http';

describe('URL boundaries', () => {
  it('round trips safe API segments without traversal', () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/), { minLength: 1, maxLength: 8 }), (segments) => {
        const path = '/' + segments.join('/');
        expect(apiPath(path)).toBe(path);
        expect(new URL(path, 'https://api.example.test').pathname).toBe(path);
      }),
      { numRuns: 1000, seed: 20260910 },
    );
  });
});
