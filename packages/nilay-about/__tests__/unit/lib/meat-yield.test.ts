import { describe, expect, it } from 'vitest';

import {
  REFERENCE_RATIOS,
  animalBalance,
  calculateMeatYield,
  freezerFit,
  isValidShare,
  packCount,
  partsBreakdown,
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

  it('adds a pack for an excess larger than floating-point rounding', () => {
    // 1,000.0000001 g of meat does not fit in one 1,000 g pack.
    expect(packCount(1.0000000001, 1000)?.packs).toBe(2);
    // 0.9 ng over is still over: the tolerance is floating-point rounding, not a weight.
    expect(packCount(1.0000000000009, 1000)?.packs).toBe(2);
  });

  it('does not add a pack for the rounding of a weight worked back through the shares', () => {
    // 1 kg dressed at 44 % and meat at 22 % is 0.5 kg exactly, which the shares give as 0.5000000000000001.
    const yieldKg = calculateMeatYield({
      stage: 'dressed',
      weightKg: 1,
      ratios: { dressed: 44, carcass: 30, meat: 22 },
    });
    expect(yieldKg.ok && yieldKg.meatKg).toBe(0.5000000000000001);
    expect(yieldKg.ok && packCount(yieldKg.meatKg!, 500)?.packs).toBe(1);
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

  it('does not fit meat over the freezer by more than floating-point rounding', () => {
    expect(freezerFit(100.00000001, 100)?.animals).toBe(0);
    // 50 ng over a 100 kg freezer does not fit either.
    expect(freezerFit(100.00000000005, 100)?.animals).toBe(0);
    // Floating-point dust still fits: 0.1 + 0.2 kg in a 0.3 kg space.
    expect(freezerFit(0.1 + 0.2, 0.3)?.animals).toBe(1);
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
    parts: [],
    costs: [],
    subsidyYen: null,
  };

  it('keeps blank shares as null', () => {
    expect(meatYieldSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it('reads settings saved before the cuts and the balance were added, as nothing entered for them', () => {
    // The shape saved at b303c7fe, before the cuts, costs and subsidy existed.
    const older = {
      species: 'boar',
      stage: 'carcass',
      weightKg: 20,
      ratios: { dressed: null, carcass: 60, meat: 30 },
      packGrams: 500,
      freezerKg: 40,
    };
    const parsed = meatYieldSettingsSchema.parse(older);
    // Nothing is filled in on the way in: the added fields stay absent.
    expect(parsed).toEqual(older);
    expect('parts' in parsed).toBe(false);
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

describe('partsBreakdown and animalBalance', () => {
  const part = (id: string, percent: number | null, pricePerKg: number | null) => ({
    id,
    name: id,
    percent,
    pricePerKg,
  });

  it('weighs each cut as its share of the usable meat and prices it', () => {
    const breakdown = partsBreakdown(10, [
      part('ロース', 20, 3000),
      part('モモ', 30, null),
      part('ネック', null, 1000),
    ]);
    expect(breakdown.lines).toEqual([
      { id: 'ロース', kg: 2, sales: 6000 },
      { id: 'モモ', kg: 3, sales: null },
      { id: 'ネック', kg: null, sales: null },
    ]);
    expect(breakdown.assignedPercent).toBe(50);
    expect(breakdown.overAssigned).toBe(false);
    expect(breakdown.sales).toBe(6000);
    expect(breakdown.unpriced).toBe(1);
  });

  it('flags shares over the whole of the meat and leaves weights empty without a meat weight', () => {
    expect(partsBreakdown(10, [part('a', 60, null), part('b', 50, null)]).overAssigned).toBe(true);
    expect(partsBreakdown(null, [part('a', 60, 1000)]).lines[0]).toEqual({ id: 'a', kg: null, sales: null });
  });

  it('adds the income and takes off the costs', () => {
    const balance = animalBalance(
      6000,
      [
        { id: 'fee', name: '処理料金', yen: 5000 },
        { id: 'bag', name: '袋', yen: 300 },
        { id: 'blank', name: '', yen: null },
      ],
      8000,
    );
    expect(balance).toEqual({ sales: 6000, subsidy: 8000, costs: 5300, net: 8700 });
    expect(animalBalance(0, [{ id: 'fee', name: '', yen: 2000 }], null).net).toBe(-2000);
  });
});
