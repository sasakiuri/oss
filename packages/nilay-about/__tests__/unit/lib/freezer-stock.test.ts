import { describe, expect, it } from 'vitest';

import { readSavedFreezerItems } from '@/app/(standalone)/labs/freezer-stock/_store';
import {
  checkUseBy,
  daysBetween,
  daysFrozen,
  freezerTotals,
  isoDate,
  parseDate,
  sortFreezerItems,
  type FreezerItem,
} from '@/lib/freezer-stock';

const item = (changes: Partial<FreezerItem>): FreezerItem => ({
  id: 'x',
  species: 'deer',
  cut: 'ロース',
  gramsPerPack: 500,
  packs: 2,
  frozenOn: '2026-09-01',
  useBy: '',
  note: '',
  ...changes,
});

const today = new Date(2026, 8, 24, 15, 0);

describe('dates', () => {
  it('reads real dates only and counts calendar days', () => {
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(daysBetween(new Date(2026, 8, 1, 23, 0), new Date(2026, 8, 2, 0, 30))).toBe(1);
    expect(isoDate(today)).toBe('2026-09-24');
  });

  it('counts days frozen and the reader’s use-by date', () => {
    expect(daysFrozen(item({}), today)).toBe(23);
    expect(daysFrozen(item({ frozenOn: '2026-10-01' }), today)).toBeNull();
    expect(checkUseBy(item({}), today)).toEqual({ kind: 'none' });
    expect(checkUseBy(item({ useBy: '2026-09-30' }), today)).toEqual({ kind: 'ahead', days: 6 });
    expect(checkUseBy(item({ useBy: '2026-09-24' }), today)).toEqual({ kind: 'today' });
    expect(checkUseBy(item({ useBy: '2026-09-20' }), today)).toEqual({ kind: 'past', days: 4 });
  });
});

describe('the list', () => {
  it('puts the oldest first, undated lines after them and empty lines last', () => {
    const sorted = sortFreezerItems([
      item({ id: 'empty', frozenOn: '2026-01-01', packs: 0 }),
      item({ id: 'undated', frozenOn: '' }),
      item({ id: 'new', frozenOn: '2026-09-20' }),
      item({ id: 'old', frozenOn: '2026-08-01' }),
      item({ id: 'undated2', frozenOn: '' }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['old', 'new', 'undated', 'undated2', 'empty']);
  });

  it('adds up packs and weight, leaving out packs without a weight', () => {
    expect(freezerTotals([item({}), item({ gramsPerPack: null, packs: 3 }), item({ packs: 0 })])).toEqual({
      packs: 5,
      grams: 1000,
      unweighedPacks: 3,
    });
  });

  it('keeps the readable lines of a damaged save and says something was lost', () => {
    const good = item({ id: 'a' });
    expect(readSavedFreezerItems({ items: [good, { id: 'b' }, good] })).toEqual({ items: [good], lost: true });
    expect(readSavedFreezerItems({ items: [good] })).toEqual({ items: [good], lost: false });
    expect(readSavedFreezerItems('junk')).toEqual({ items: [], lost: true });
  });
});
