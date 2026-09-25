import { describe, expect, it } from 'vitest';

import { costEstimate, dangerSigns, kyotoBearEnergy, solarSizing } from '@/lib/electric-fence-power';

describe('Kyoto’s guide for a bear fence', () => {
  it('picks the smallest row whose perimeter reaches the fence, and nothing beyond 900 m', () => {
    expect(kyotoBearEnergy(200)?.joules).toBe(1);
    expect(kyotoBearEnergy(450)?.joules).toBe(1);
    expect(kyotoBearEnergy(451)?.joules).toBe(1.5);
    expect(kyotoBearEnergy(900)?.joules).toBe(2);
    expect(kyotoBearEnergy(901)).toBeNull();
    expect(kyotoBearEnergy(Number.NaN)).toBeNull();
  });
});

describe('solar panel and battery (Kencove’s method)', () => {
  it('reproduces Kencove’s worked example', () => {
    // 12 V × 0.29 A = 3.48 W, 24 h, 3.68 peak sun hours: 22.7 W before, 27.2 W with the 20 % margin.
    const result = solarSizing({
      energizerW: 3.48,
      hoursPerDay: 24,
      batteryV: 12,
      peakSunHours: 3.68,
      daysWithoutSun: 0,
      usablePercent: 50,
    });
    expect(result?.dailyWh).toBeCloseTo(83.52, 10);
    expect(result?.dailyAh).toBeCloseTo(6.96, 10);
    expect(result?.panelW).toBeCloseTo((83.52 / 3.68) * 1.2, 10);
  });

  it('sizes the battery for the days without sun at the usable share', () => {
    const result = solarSizing({
      energizerW: 0.7888,
      hoursPerDay: 24,
      batteryV: 12,
      peakSunHours: 3,
      daysWithoutSun: 5,
      usablePercent: 50,
    });
    expect(result?.batteryAh).toBeCloseTo(((0.7888 * 24) / 12) * 5 * 2, 10);
  });

  it('refuses hours beyond a day and a missing power draw', () => {
    const base = {
      energizerW: 1,
      hoursPerDay: 24,
      batteryV: 12,
      peakSunHours: 3,
      daysWithoutSun: 3,
      usablePercent: 50,
    };
    expect(solarSizing({ ...base, hoursPerDay: 25 })).toBeNull();
    expect(solarSizing({ ...base, energizerW: Number.NaN })).toBeNull();
    expect(solarSizing({ ...base, usablePercent: 0 })).toBeNull();
  });
});

describe('fittings and cost', () => {
  it('puts at least one danger sign on any fence', () => {
    expect(dangerSigns(400, 100)).toBe(4);
    expect(dangerSigns(401, 100)).toBe(5);
    expect(dangerSigns(40, 100)).toBe(1);
    expect(dangerSigns(400, Number.NaN)).toBeNull();
  });

  it('totals quantity × price, leaves out unpriced items and applies the subsidy', () => {
    const result = costEstimate(
      [
        { id: 'wire', quantity: 1000, unitPrice: 5 },
        { id: 'post', quantity: 100, unitPrice: 300 },
        { id: 'energizer', quantity: 1, unitPrice: Number.NaN },
        { id: 'breaker', quantity: 0, unitPrice: Number.NaN },
      ],
      50,
    );
    expect(result).toEqual({ totalYen: 35000, selfYen: 17500, missing: ['energizer'] });
    expect(costEstimate([], 120)).toBeNull();
  });
});
