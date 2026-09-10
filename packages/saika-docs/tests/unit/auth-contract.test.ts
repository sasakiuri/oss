// SPDX-License-Identifier: MIT
import { expect, it } from 'vitest';

import { safeReturnTo } from '../../src/shared/api/auth';

it('accepts only same-origin return paths and preserves their query', () => {
  for (const invalid of [
    '',
    'https://evil.test',
    '//evil.test',
    '/%2Fevil.test',
    '/\\evil.test',
    '/%0dheader',
    '/%',
    '/a b',
    '/%20path',
  ])
    expect(safeReturnTo(invalid)).toBe('/');
  for (const valid of ['/', '/getting-started/', '/reference/?page=2', '/%E6%96%87%E6%9B%B8/'])
    expect(safeReturnTo(valid)).toBe(valid);
});
