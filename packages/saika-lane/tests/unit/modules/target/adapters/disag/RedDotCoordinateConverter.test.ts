// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { RedDotCoordinateConverter } from '@/main/modules/target/adapters/disag/RedDotCoordinateConverter';

describe('RedDotCoordinateConverter', () => {
  it('converts signed 0.01 mm raw coordinates to millimetres without flipping Y', () => {
    const coordinates = new RedDotCoordinateConverter().convert(300, -400);

    expect(coordinates).toEqual({ xMm: 3, yMm: -4 });
  });
});
