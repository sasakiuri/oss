import { describe, expect, it } from 'vitest';

import {
  FUNRYU_EXAMPLE_TEMPERATURES,
  funryuDensity,
  monthlyLossPercent,
  pelletClearanceDensity,
  remDensity,
} from '@/lib/deer-density';

describe('the random encounter model', () => {
  it('follows eqn 4 of Rowcliffe et al. (2008)', () => {
    // 1 pass a day, v = 1 km/day, r = 12 m, θ = 0.175 rad (the paper's simulation defaults).
    const expected = (1 * Math.PI) / (1 * 0.012 * (2 + 0.175));
    expect(
      remDensity({
        photos: 10,
        cameraDays: 10,
        dayRangeKm: 1,
        radiusM: 12,
        angleDegrees: (0.175 * 180) / Math.PI,
        groupSize: 1,
      }),
    ).toBeCloseTo(expected, 10);
  });

  it('multiplies by the group size and gives zero for no passes', () => {
    const base = { photos: 30, cameraDays: 100, dayRangeKm: 7.4, radiusM: 18.1, angleDegrees: 57, groupSize: 1 };
    const one = remDensity(base) ?? Number.NaN;
    expect(remDensity({ ...base, groupSize: 1.5 })).toBeCloseTo(one * 1.5, 10);
    expect(remDensity({ ...base, photos: 0 })).toBe(0);
  });

  it('refuses inputs the formula cannot take', () => {
    const base = { photos: 30, cameraDays: 100, dayRangeKm: 7.4, radiusM: 18.1, angleDegrees: 57, groupSize: 1 };
    expect(remDensity({ ...base, cameraDays: 0 })).toBeNull();
    expect(remDensity({ ...base, radiusM: Number.NaN })).toBeNull();
    expect(remDensity({ ...base, angleDegrees: 400 })).toBeNull();
  });
});

describe('Taylor and Williams, as in Nagano’s plan', () => {
  it('gives deer per hectare and per km²', () => {
    const result = pelletClearanceDensity({
      pelletsPerM2: 2,
      placed: 100,
      remaining: 50,
      days: 30,
      pelletsPerDay: 1385,
    });
    const perHa = (1 / 1385) * 2 * (100 / 50) * (Math.log(2) / 30) * 10000;
    expect(result?.perHa).toBeCloseTo(perHa, 12);
    expect(result?.perKm2).toBeCloseTo(perHa * 100, 10);
  });

  it('needs some pellets gone and some left', () => {
    const base = { pelletsPerM2: 2, placed: 100, remaining: 50, days: 30, pelletsPerDay: 1385 };
    expect(pelletClearanceDensity({ ...base, remaining: 100 })).toBeNull();
    expect(pelletClearanceDensity({ ...base, remaining: 0 })).toBeNull();
  });
});

describe('FUNRYU (Iwamoto et al. 2000)', () => {
  it('reproduces the densities of the paper’s appendix 1 for each survey month', () => {
    const expected = [
      12.5717, 11.0696, 10.0551, 9.6664, 9.6146, 10.3348, 11.608, 13.115, 14.6328, 15.2812, 15.0915, 14.3968,
    ];
    expected.forEach((density, index) => {
      expect(
        funryuDensity({ pelletsPerM2: 2.17, surveyMonth: index + 1, temperatures: FUNRYU_EXAMPLE_TEMPERATURES }),
      ).toBeCloseTo(density, 3);
    });
  });

  it('uses eq (9) for the monthly loss', () => {
    expect(monthlyLossPercent(10, 1)).toBeCloseTo((0.188 * 10 + 0.778) / (0.027 + 0.057), 12);
  });

  it('refuses a month too cold for eq (9), a wrong month and missing temperatures', () => {
    const cold: number[] = [...FUNRYU_EXAMPLE_TEMPERATURES];
    cold[0] = -6;
    expect(funryuDensity({ pelletsPerM2: 2.17, surveyMonth: 3, temperatures: cold })).toBeNull();
    expect(
      funryuDensity({ pelletsPerM2: 2.17, surveyMonth: 13, temperatures: FUNRYU_EXAMPLE_TEMPERATURES }),
    ).toBeNull();
    expect(funryuDensity({ pelletsPerM2: 2.17, surveyMonth: 1, temperatures: [1, 2] })).toBeNull();
  });
});
