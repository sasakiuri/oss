import { describe, expect, it } from 'vitest';

import { convertFitLength, convertFitSheet, emptyFitSheet, tallyEyeTrials } from '@/lib/gun-fit';
import { savedFitSheetSchema } from '@/lib/schemas/gun-fit';

describe('stock dimensions', () => {
  it('converts between mm and inch at the resolution a tape reads', () => {
    // 1 in = 25.4 mm exactly; mm are kept to 0.5, inches to 0.01.
    expect(convertFitLength(14.5, 'inch', 'mm')).toBe(368.5);
    expect(convertFitLength(368, 'mm', 'inch')).toBe(14.49);
    expect(convertFitLength(null, 'mm', 'inch')).toBeNull();
    expect(convertFitLength(38, 'mm', 'mm')).toBe(38);
  });

  it('converts every length of a sheet and keeps the rest', () => {
    const sheet = { ...emptyFitSheet(), name: 'O/U', lengthOfPull: 368, dropAtComb: 38, castSide: 'right' as const };
    expect(convertFitSheet(sheet, 'inch')).toEqual({
      ...sheet,
      unit: 'inch',
      lengthOfPull: 14.49,
      dropAtComb: 1.5,
    });
  });

  it('saves a sheet only with a name', () => {
    const base = { ...emptyFitSheet(), id: 'a', savedAt: '2026-09-24T00:00:00.000Z' };
    expect(savedFitSheetSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(savedFitSheetSchema.safeParse({ ...base, name: 'O/U' }).success).toBe(true);
    expect(savedFitSheetSchema.safeParse({ ...base, name: 'O/U', dropAtHeel: -1 }).success).toBe(false);
  });
});

describe('eye dominance tally', () => {
  it('names an eye only when it was seen in more than half the trials', () => {
    expect(tallyEyeTrials(['right', 'right', 'left'])).toMatchObject({ right: 2, left: 1, dominant: 'right' });
    expect(tallyEyeTrials(['right', 'left'])).toMatchObject({ dominant: null });
    expect(tallyEyeTrials(['left', 'unclear', 'unclear'])).toMatchObject({ unclear: 2, dominant: null });
    expect(tallyEyeTrials([])).toMatchObject({ trials: 0, dominant: null });
  });
});
