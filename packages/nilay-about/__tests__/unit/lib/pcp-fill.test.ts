import { describe, expect, it } from 'vitest';

import { ATMOSPHERE_BAR, fromBar, planFills, toBar } from '@/lib/pcp-fill';

const base = { tankLitres: 12, tankBar: 300, fillBar: 200, refillBar: 100, gunCc: 200, hoseCc: 0 };

describe('pressure units', () => {
  it('converts MPa and psi to bar and back', () => {
    expect(toBar(30, 'mpa')).toBe(300);
    expect(toBar(3000, 'psi')).toBeCloseTo(206.84, 2);
    expect(fromBar(toBar(4500, 'psi'), 'psi')).toBeCloseTo(4500, 9);
  });
});

describe('filling from a cylinder', () => {
  it('takes the same air out of the cylinder for each full fill', () => {
    const plan = planFills(base);
    if (plan.kind !== 'ok') throw new Error('expected a plan');
    // Each fill moves 100 bar into 0.2 L: 20 bar·L, which is 1.667 bar out of 12 L.
    const drop = (100 * 0.2) / 12;
    expect(plan.steps[0]!.tankAfterBar).toBeCloseTo(300 - drop, 9);
    expect(plan.steps[1]!.tankAfterBar).toBeCloseTo(300 - 2 * drop, 9);
    // Full fills last while the balanced pressure reaches 200 bar.
    for (const step of plan.steps.filter((item) => item.full)) expect(step.gunBar).toBe(200);
    const lastFull = plan.steps.filter((item) => item.full).at(-1)!;
    expect(lastFull.tankAfterBar).toBeGreaterThanOrEqual(200 - (0.2 * (200 - 100)) / 12 - 1e-9);
    // A fill is full while the cylinder stands at 200 + 100 × 0.2 / 12 = 201.67 bar or more before it
    // (the atmosphere cancels): 300 − 1.667 n ≥ 201.67 holds for n = 0 to 59, which is 60 full fills.
    expect(plan.fullFills).toBe(60);
    const partial = plan.steps.at(-1)!;
    expect(partial.full).toBe(false);
    expect(partial.gunBar).toBeLessThan(200);
    expect(partial.gunBar).toBeGreaterThan(100);
  });

  it('loses the hose’s air on every fill', () => {
    const without = planFills(base);
    const withHose = planFills({ ...base, hoseCc: 10 });
    if (without.kind !== 'ok' || withHose.kind !== 'ok') throw new Error('expected plans');
    expect(withHose.fullFills).toBeLessThan(without.fullFills);
    const drop = ((200 - 100) * 0.2 + (200 + ATMOSPHERE_BAR - ATMOSPHERE_BAR) * 0.01) / 12;
    expect(withHose.steps[0]!.tankAfterBar).toBeCloseTo(300 - drop, 9);
  });

  it('gives no fill when the cylinder is not above the gun', () => {
    const plan = planFills({ ...base, tankBar: 100 });
    expect(plan).toMatchObject({ kind: 'ok', steps: [], fullFills: 0 });
  });

  it('refuses inputs that describe no fill', () => {
    expect(planFills({ ...base, fillBar: 100 })).toEqual({ kind: 'invalid', problem: 'order' });
    expect(planFills({ ...base, gunCc: 0 })).toEqual({ kind: 'invalid', problem: 'volumes' });
    expect(planFills({ ...base, tankBar: Number.NaN })).toEqual({ kind: 'invalid', problem: 'pressures' });
  });
});
