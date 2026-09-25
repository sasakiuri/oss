import { describe, expect, it } from 'vitest';

import { fitWithin } from '@/lib/photo-resize';

describe('fitWithin', () => {
  it('scales the longer side down to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves a smaller picture at its size, and never rounds a side to nothing', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
