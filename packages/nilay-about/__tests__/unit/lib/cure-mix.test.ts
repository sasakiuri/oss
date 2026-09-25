import { describe, expect, it } from 'vitest';

import {
  NITRITE_PER_SODIUM_NITRITE,
  NITRITE_RESIDUE_LIMIT_G_PER_KG,
  calculateCureMix,
  isCureCompositionOver,
  leanFatBlend,
  type CureMixSettings,
} from '@/lib/cure-mix';

const settings = (changes: Partial<CureMixSettings> = {}): CureMixSettings => ({
  leanG: 800,
  fatG: 200,
  waterG: null,
  basis: 'meat',
  saltPercent: 2,
  useCure: false,
  curePercent: null,
  cureNitritePercent: null,
  cureExpressedAs: 'sodiumNitrite',
  cureSaltPercent: null,
  ingredients: [],
  leanPricePerKg: null,
  fatPricePerKg: null,
  saltPricePerKg: null,
  curePricePerKg: null,
  linkG: null,
  casingGPerM: null,
  casingPricePerM: null,
  ...changes,
});

const grams = (result: ReturnType<typeof calculateCureMix>, id: string) =>
  result.lines.find((line) => line.id === id)?.grams;

describe('the constants', () => {
  it('uses the 0.070 g/kg residue limit and the nitrite share of sodium nitrite from the atomic weights', () => {
    expect(NITRITE_RESIDUE_LIMIT_G_PER_KG).toBe(0.07);
    // 46.005 / 68.995
    expect(NITRITE_PER_SODIUM_NITRITE).toBeCloseTo(0.66679, 5);
  });
});

describe('calculateCureMix', () => {
  it('scales the recipe to the meat and gives the fat share', () => {
    const result = calculateCureMix(
      settings({ ingredients: [{ id: 'pepper', name: '黒こしょう', percent: 0.2, pricePerKg: null }] }),
    );
    expect(result.meatG).toBe(1000);
    expect(result.fatPercent).toBe(20);
    expect(grams(result, 'salt')).toBe(20);
    expect(grams(result, 'pepper')).toBe(2);
    expect(result.totalG).toBe(1022);
    expect(result.saltPercentOfTotal).toBeCloseTo((20 / 1022) * 100, 10);
    expect(result.nitrite).toEqual({ kind: 'none' });
  });

  it('takes the percentages of the meat and the water together for a brine', () => {
    const result = calculateCureMix(settings({ waterG: 1000, basis: 'meatAndWater' }));
    expect(result.basisG).toBe(2000);
    expect(grams(result, 'salt')).toBe(40);
  });

  it('counts the salt the curing agent brings and gives the nitrite added over the whole batch', () => {
    // 0.25 % of an agent with 6.25 % sodium nitrite and 93.75 % salt.
    const result = calculateCureMix(
      settings({ useCure: true, curePercent: 0.25, cureNitritePercent: 6.25, cureSaltPercent: 93.75 }),
    );
    expect(grams(result, 'cure')).toBe(2.5);
    expect(result.saltFromCureG).toBeCloseTo(2.34375, 10);
    expect(grams(result, 'salt')).toBeCloseTo(17.65625, 10);
    expect(result.totalG).toBeCloseTo(1020.15625, 10);
    const nitriteG = 2.5 * 0.0625 * NITRITE_PER_SODIUM_NITRITE;
    expect(result.nitrite).toEqual({ kind: 'added', mgPerKg: expect.closeTo((nitriteG * 1e6) / 1020.15625, 6) });
  });

  it('does not judge the added nitrite against the limit, which is on what remains in the product', () => {
    // 60 mg of nitrite in 1 kg of batch. Dried by 20 % with 5 % of the nitrite lost, the product holds
    // 57 mg in 0.8 kg, 71.25 mg/kg, over the 70 mg/kg residue limit: the amount added cannot tell.
    const result = calculateCureMix(
      settings({
        leanG: 1000,
        fatG: null,
        saltPercent: null,
        useCure: true,
        curePercent: 0.1,
        cureNitritePercent: 6,
        cureExpressedAs: 'nitrite',
      }),
    );
    expect(result.nitrite).toEqual({ kind: 'added', mgPerKg: expect.closeTo(60_000 / 1001, 6) });
    expect(result.nitrite).not.toHaveProperty('maxCureG');
  });

  it('reads a label given as nitrite without converting it', () => {
    const result = calculateCureMix(
      settings({ useCure: true, curePercent: 0.1, cureNitritePercent: 5, cureExpressedAs: 'nitrite' }),
    );
    // 1 g of agent carries 0.05 g of nitrite, in 1021 g of batch.
    expect(result.nitrite).toEqual({ kind: 'added', mgPerKg: expect.closeTo(50_000 / 1021, 6) });
  });

  it('refuses an agent whose salt and sodium nitrite come to more than the whole agent', () => {
    // 60 % salt and 60 % sodium nitrite: 120 g of contents in 100 g of agent.
    const over = calculateCureMix(
      settings({ useCure: true, curePercent: 10, cureNitritePercent: 60, cureSaltPercent: 60 }),
    );
    expect(over.nitrite).toEqual({ kind: 'composition' });
    expect(over.saltFromCureG).toBe(0);
    expect(grams(over, 'salt')).toBe(20);
    // 4 % as nitrite is 6.0 % as sodium nitrite, so 95 % salt is too much.
    expect(
      calculateCureMix(
        settings({
          useCure: true,
          curePercent: 0.25,
          cureNitritePercent: 4,
          cureExpressedAs: 'nitrite',
          cureSaltPercent: 95,
        }),
      ).nitrite,
    ).toEqual({ kind: 'composition' });
    expect(isCureCompositionOver(settings({ cureNitritePercent: 6.25, cureSaltPercent: 93.75 }))).toBe(false);
    expect(isCureCompositionOver(settings({ cureNitritePercent: 60, cureSaltPercent: 60 }))).toBe(true);
  });

  it('asks for the nitrite content before checking, and notices an agent saltier than the recipe', () => {
    expect(calculateCureMix(settings({ useCure: true, curePercent: 0.25 })).nitrite).toEqual({ kind: 'incomplete' });
    const salty = calculateCureMix(
      settings({
        saltPercent: 0.1,
        useCure: true,
        curePercent: 0.25,
        cureNitritePercent: 6.25,
        cureSaltPercent: 93.75,
      }),
    );
    expect(salty.saltShortfall).toBe(true);
    expect(grams(salty, 'salt')).toBe(0);
  });

  it('adds up the cost, links and casing', () => {
    const result = calculateCureMix(
      settings({
        leanPricePerKg: 2000,
        fatPricePerKg: 500,
        saltPricePerKg: 200,
        linkG: 60,
        casingGPerM: 400,
        casingPricePerM: 50,
      }),
    );
    // 1.6 + 0.1 + 0.004 thousand yen for the meat, fat and salt; 1020 g of mix in 2.55 m of casing.
    expect(result.casing?.metres).toBeCloseTo(2.55, 10);
    expect(result.cost).toBeCloseTo(1600 + 100 + 4 + 2.55 * 50, 10);
    expect(result.costPerKg).toBeCloseTo((1600 + 100 + 4 + 127.5) / 1.02, 10);
    expect(result.links).toEqual({ count: 17, lastLinkG: 60 });
    expect(result.unpricedLines).toBe(0);
  });
});

describe('leanFatBlend', () => {
  it('mixes two trimmings to the fat share asked for', () => {
    const blend = leanFatBlend(1000, 20, 5, 80)!;
    expect(blend.leanG).toBeCloseTo(800, 10);
    expect(blend.fatG).toBeCloseTo(200, 10);
    expect((blend.leanG * 5 + blend.fatG * 80) / 1000).toBeCloseTo(20, 10);
  });

  it('refuses a target outside the two trimmings', () => {
    expect(leanFatBlend(1000, 90, 5, 80)).toBeNull();
    expect(leanFatBlend(1000, 20, 80, 5)).toBeNull();
    expect(leanFatBlend(0, 20, 5, 80)).toBeNull();
  });
});
