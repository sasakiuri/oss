import { describe, expect, it } from 'vitest';

import {
  REFERENCE_RATIOS,
  calculateMeatYield,
  freezerFit,
  isValidShare,
  packCount,
  ratioOrderProblem,
  referenceRatios,
} from '@/lib/meat-yield';
import { meatYieldSettingsSchema } from '@/lib/schemas/meat-yield';

describe('reference shares', () => {
  it('carries only the figures printed in the MAFF manuals', () => {
    // Processing manual (Aug 2022) p.10 note 2: deer carcass 50 %.
    // General measures manual (Mar 2023) p.48 and p.77: boar about 30 %, deer about 20 %.
    expect(referenceRatios('deer')).toEqual({ dressed: null, carcass: 50, meat: 20 });
    expect(referenceRatios('boar')).toEqual({ dressed: null, carcass: null, meat: 30 });
    expect(referenceRatios('other')).toEqual({ dressed: null, carcass: null, meat: null });
    expect(REFERENCE_RATIOS.deer.carcass?.source).toBe('processing-manual');
    expect(REFERENCE_RATIOS.deer.meat?.source).toBe('general-manual');
    expect(REFERENCE_RATIOS.boar.meat?.source).toBe('general-manual');
  });
});

describe('calculateMeatYield', () => {
  const deer = referenceRatios('deer');

  it('works each stage from the whole weight', () => {
    // 30 kg is the per-deer weight of the manual's own example: 30 × 50 % = 15 kg, 30 × 20 % = 6 kg.
    expect(calculateMeatYield({ stage: 'whole', weightKg: 30, ratios: deer })).toEqual({
      ok: true,
      wholeKg: 30,
      dressedKg: null,
      carcassKg: 15,
      meatKg: 6,
    });
  });

  it('works back to the whole animal from a carcass weight', () => {
    // 15 kg ÷ 50 % = 30 kg whole, then 30 × 20 % = 6 kg.
    expect(calculateMeatYield({ stage: 'carcass', weightKg: 15, ratios: deer })).toEqual({
      ok: true,
      wholeKg: 30,
      dressedKg: null,
      carcassKg: 15,
      meatKg: 6,
    });
  });

  it('uses a field-dressed share the reader supplies', () => {
    // 35 kg ÷ 70 % = 50 kg; 50 × 50 % = 25 kg; 50 × 20 % = 10 kg.
    const outcome = calculateMeatYield({ stage: 'dressed', weightKg: 35, ratios: { ...deer, dressed: 70 } });
    expect(outcome).toEqual({ ok: true, wholeKg: 50, dressedKg: 35, carcassKg: 25, meatKg: 10 });
  });

  it('works out nothing but the weighed stage when its share is missing', () => {
    // No boar carcass share is published, so a carcass weight cannot be taken back to the whole animal.
    expect(calculateMeatYield({ stage: 'carcass', weightKg: 20, ratios: referenceRatios('boar') })).toEqual({
      ok: true,
      wholeKg: null,
      dressedKg: null,
      carcassKg: 20,
      meatKg: null,
    });
  });

  it('gives boar meat from the whole weight', () => {
    // 60 × 30 % = 18 kg.
    const outcome = calculateMeatYield({ stage: 'whole', weightKg: 60, ratios: referenceRatios('boar') });
    expect(outcome).toMatchObject({ ok: true, wholeKg: 60, carcassKg: null, meatKg: 18 });
  });

  it('refuses a weight that is not above zero', () => {
    expect(calculateMeatYield({ stage: 'whole', weightKg: 0, ratios: deer })).toEqual({ ok: false, reason: 'weight' });
    expect(calculateMeatYield({ stage: 'whole', weightKg: NaN, ratios: deer })).toEqual({
      ok: false,
      reason: 'weight',
    });
  });

  it('refuses a share outside 0 < share ≤ 100', () => {
    expect(calculateMeatYield({ stage: 'whole', weightKg: 30, ratios: { ...deer, meat: 0 } })).toEqual({
      ok: false,
      reason: 'ratio',
      stage: 'meat',
    });
    expect(calculateMeatYield({ stage: 'whole', weightKg: 30, ratios: { ...deer, dressed: 100.1 } })).toEqual({
      ok: false,
      reason: 'ratio',
      stage: 'dressed',
    });
    // 100 % is the whole animal and is allowed.
    expect(calculateMeatYield({ stage: 'whole', weightKg: 30, ratios: { ...deer, dressed: 100 } })).toMatchObject({
      ok: true,
      dressedKg: 30,
    });
  });

  it('refuses a later stage heavier than an earlier one', () => {
    expect(calculateMeatYield({ stage: 'whole', weightKg: 30, ratios: { ...deer, meat: 60 } })).toEqual({
      ok: false,
      reason: 'order',
      stages: ['carcass', 'meat'],
    });
  });
});

describe('ratioOrderProblem', () => {
  it('accepts equal shares and skips blanks', () => {
    expect(ratioOrderProblem({ dressed: null, carcass: 50, meat: 50 })).toBeNull();
    expect(ratioOrderProblem({ dressed: 60, carcass: null, meat: 20 })).toBeNull();
  });

  it('names the pair that is out of order, earlier stage first', () => {
    expect(ratioOrderProblem({ dressed: 40, carcass: 50, meat: 20 })).toEqual(['dressed', 'carcass']);
    // A blank carcass does not hide a meat share above the dressed share.
    expect(ratioOrderProblem({ dressed: 20, carcass: null, meat: 30 })).toEqual(['dressed', 'meat']);
  });
});

describe('isValidShare', () => {
  it('accepts 0 < share ≤ 100 only', () => {
    expect(isValidShare(0.1)).toBe(true);
    expect(isValidShare(100)).toBe(true);
    expect(isValidShare(0)).toBe(false);
    expect(isValidShare(-5)).toBe(false);
    expect(isValidShare(101)).toBe(false);
    expect(isValidShare(NaN)).toBe(false);
    expect(isValidShare(null)).toBe(false);
  });
});

describe('packCount', () => {
  it('fills whole packs and reports the part-filled last one', () => {
    expect(packCount(6, 500)).toEqual({ packs: 12, lastPackGrams: 500 });
    const partial = packCount(6.1, 500);
    expect(partial?.packs).toBe(13);
    expect(partial?.lastPackGrams).toBeCloseTo(100, 6);
    expect(packCount(0.3, 500)).toEqual({ packs: 1, lastPackGrams: 300 });
  });

  it('does not add a pack for floating-point dust', () => {
    // A 50 kg boar at 30 % is 15 kg: 30 packs of 500 g exactly.
    const meat = (50 * 30) / 100;
    expect(packCount(meat, 500)?.packs).toBe(30);
    // 0.1 + 0.2 kg is 300.00000000000006 g in floating point, still one 300 g pack.
    expect(packCount(0.1 + 0.2, 300)?.packs).toBe(1);
  });

  it('gives nothing without a usable weight or pack size', () => {
    expect(packCount(0, 500)).toBeNull();
    expect(packCount(6, 0)).toBeNull();
    expect(packCount(NaN, 500)).toBeNull();
  });
});

describe('freezerFit', () => {
  it('states the share of the freezer and how many animals fit', () => {
    expect(freezerFit(6, 30)).toEqual({ percent: 20, animals: 5, shownPercent: 20 });
    expect(freezerFit(6, 6)).toEqual({ percent: 100, animals: 1, shownPercent: 100 });
    expect(freezerFit(6, 5)).toEqual({ percent: 120, animals: 0, shownPercent: 120 });
    expect(freezerFit(6, 0)).toBeNull();
  });

  it('never prints 100 % for meat that does not fit, nor over 100 % for meat that does', () => {
    // 6 ÷ 5.99 = 100.17 %, which rounds to 100 but does not fit.
    const over = freezerFit(6, 5.99);
    expect(over?.animals).toBe(0);
    expect(over?.shownPercent).toBe(101);
    // 6 ÷ 6.02 = 99.67 %, which fits and may read 100 %.
    expect(freezerFit(6, 6.02)).toMatchObject({ animals: 1, shownPercent: 100 });
    // 0.1 + 0.2 kg in a 0.3 kg freezer is a hair over 100 % in floating point but fits exactly.
    expect(freezerFit(0.1 + 0.2, 0.3)).toMatchObject({ animals: 1, shownPercent: 100 });
  });
});

describe('meatYieldSettingsSchema', () => {
  const settings = {
    species: 'deer',
    stage: 'whole',
    weightKg: 30,
    ratios: { dressed: null, carcass: 50, meat: 20 },
    packGrams: 500,
    freezerKg: null,
  };

  it('keeps blank shares as null', () => {
    expect(meatYieldSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it('rejects shares outside 0 < share ≤ 100 and unknown species', () => {
    expect(meatYieldSettingsSchema.safeParse({ ...settings, ratios: { ...settings.ratios, meat: 0 } }).success).toBe(
      false,
    );
    expect(
      meatYieldSettingsSchema.safeParse({ ...settings, ratios: { ...settings.ratios, carcass: 120 } }).success,
    ).toBe(false);
    expect(meatYieldSettingsSchema.safeParse({ ...settings, species: 'bear' }).success).toBe(false);
  });
});
