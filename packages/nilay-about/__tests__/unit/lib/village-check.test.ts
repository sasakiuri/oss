import { describe, expect, it } from 'vitest';

import {
  VILLAGE_ITEMS,
  VILLAGE_SOURCES,
  compareInspections,
  previousInspection,
  summarizeInspection,
  type Inspection,
} from '@/lib/village-check';

describe('the village inspection', () => {
  it('has unique items, each quoting a known source', () => {
    const ids = VILLAGE_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of VILLAGE_ITEMS) {
      expect(VILLAGE_SOURCES[item.source]).toBeDefined();
      expect(item.quote.length).toBeGreaterThan(5);
    }
  });

  it('includes the bear items added to the national form in July 2026', () => {
    expect(VILLAGE_ITEMS.map((item) => item.id)).toEqual(expect.arrayContaining(['s5-16', 's5-17', 's5-18']));
  });

  it('counts items not looked at as unchecked', () => {
    const summary = summarizeInspection({
      's5-16': { status: 'found', note: '' },
      bamboo: { status: 'clear', note: '' },
    });
    expect(summary).toEqual({ found: 1, clear: 1, unchecked: VILLAGE_ITEMS.length - 2 });
  });

  it('says what is new, resolved and still there since the inspection before', () => {
    const changes = compareInspections(
      {
        's5-16': { status: 'found', note: '' },
        bamboo: { status: 'clear', note: '' },
        grave: { status: 'found', note: '' },
      },
      {
        bamboo: { status: 'found', note: '' },
        grave: { status: 'found', note: '' },
        garbage: { status: 'found', note: '' },
      },
    );
    expect(changes).toEqual([
      { id: 's5-16', change: 'new' },
      { id: 'bamboo', change: 'resolved' },
      { id: 'grave', change: 'remaining' },
    ]);
  });

  it('finds the previous inspection by date, not by the order saved', () => {
    const inspection = (id: string, date: string): Inspection => ({ id, date, area: '', results: {} });
    const list = [inspection('a', '2026-09-01'), inspection('b', '2026-07-01'), inspection('c', '2026-08-01')];
    expect(previousInspection(list, 'a')?.id).toBe('c');
    expect(previousInspection(list, 'c')?.id).toBe('b');
    expect(previousInspection(list, 'b')).toBeNull();
  });
});
