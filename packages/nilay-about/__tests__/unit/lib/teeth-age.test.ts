import { describe, expect, it } from 'vitest';

import { DEER_MEAN_AGE, boarAge, deerAge } from '@/lib/teeth-age';

const range = (estimate: ReturnType<typeof deerAge>) => (estimate ? [estimate.min, estimate.max] : null);

describe('deerAge (尾崎 2003)', () => {
  it('gives 0 for milk incisors and the rough range of each wear class', () => {
    expect(range(deerAge('deciduous', null))).toEqual([0, 0]);
    expect(range(deerAge('permanent', 'I'))).toEqual([1, 1]);
    expect(range(deerAge('permanent', 'II'))).toEqual([2, 2]);
    expect(range(deerAge('permanent', 'III'))).toEqual([3, 5]);
    expect(range(deerAge('permanent', 'IV'))).toEqual([6, null]);
    expect(deerAge('permanent', 'IV')!.label.ja).toBe('6 歳以上');
  });

  it('waits for the wear class once the incisor is permanent', () => {
    expect(deerAge(null, null)).toBeNull();
    expect(deerAge('permanent', null)).toBeNull();
  });

  it('keeps the mean ages of table 3', () => {
    expect(DEER_MEAN_AGE.III).toEqual({ male: '3.6 ± 0.3', female: '4.3 ± 0.4' });
  });
});

describe('boarAge (辻・横山 2014)', () => {
  it('reads the third molar first', () => {
    expect(range(boarAge({ m1: null, m2: null, m3: 'full' }))).toEqual([3, null]);
    expect(range(boarAge({ m1: null, m2: null, m3: 'm3-3' }))).toEqual([2, 3]);
    expect(range(boarAge({ m1: null, m2: null, m3: 'm3-2' }))).toEqual([2, 3]);
    expect(range(boarAge({ m1: null, m2: null, m3: 'm3-1' }))).toEqual([1, 2]);
  });

  it('then the second molar, then the first', () => {
    expect(range(boarAge({ m1: null, m2: 'erupted', m3: 'none' }))).toEqual([1, 1]);
    expect(range(boarAge({ m1: null, m2: 'erupting', m3: 'none' }))).toEqual([0, 1]);
    expect(range(boarAge({ m1: 'erupted', m2: 'none', m3: 'none' }))).toEqual([0, 0]);
    expect(range(boarAge({ m1: 'erupting', m2: 'none', m3: 'none' }))).toEqual([0, 0]);
    expect(boarAge({ m1: null, m2: 'none', m3: 'none' })).toBeNull();
    expect(boarAge({ m1: null, m2: null, m3: null })).toBeNull();
  });

  it('says that past the full third molar only the cementum tells the age', () => {
    expect(boarAge({ m1: null, m2: null, m3: 'full' })!.basis.ja).toContain('セメント質');
  });
});
