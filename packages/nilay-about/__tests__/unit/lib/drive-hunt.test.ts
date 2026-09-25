import { describe, expect, it } from 'vitest';

import { drawLots, localPlan, sectorRing, sectorSweep } from '@/lib/drive-hunt';
import { inverseGeodesic } from '@/lib/geodesy';
import type { Participant, Stand } from '@/lib/schemas/drive-hunt';

const stand = (id: string): Stand => ({
  id,
  label: id,
  position: { latitude: 35.5, longitude: 138.5 },
  noFire: [],
  assigneeId: null,
});
const person = (id: string, role: Participant['role'] = 'stand'): Participant => ({ id, name: id, role });

describe('drawing lots', () => {
  it('gives each stand-taker one stand and leaves beaters out', () => {
    const result = drawLots(
      [stand('1'), stand('2'), stand('3')],
      [person('a'), person('b', 'beater'), person('c'), person('d')],
      Math.random,
    );
    const assigned = [...result.values()];
    expect(new Set(assigned).size).toBe(3);
    expect(assigned).not.toContain('b');
  });

  it('leaves the last stands empty when there are fewer people', () => {
    const result = drawLots([stand('1'), stand('2')], [person('a')], () => 0.5);
    expect([...result.values()]).toEqual(['a', null]);
  });

  it('follows the random numbers it is given', () => {
    // With 0 every time, each step swaps the last person with the first.
    const result = drawLots([stand('1'), stand('2'), stand('3')], [person('a'), person('b'), person('c')], () => 0);
    expect([...result.values()]).toEqual(['b', 'c', 'a']);
  });
});

describe('no-fire sectors', () => {
  it('sweeps clockwise across north', () => {
    expect(sectorSweep({ from: 330, to: 30 })).toBe(60);
    expect(sectorSweep({ from: 0, to: 360 })).toBe(360);
  });

  it('draws a wedge of the given length', () => {
    const origin = { latitude: 35.5, longitude: 138.5 };
    const ring = sectorRing(origin, { from: 80, to: 100 }, 300);
    expect(ring[0]).toEqual(origin);
    for (const point of ring.slice(1)) expect(inverseGeodesic(origin, point)!.distanceMetres).toBeCloseTo(300, 3);
  });
});

describe('the printed plan', () => {
  it('lays stands out in metres about their centre', () => {
    const plan = localPlan([
      { latitude: 35.5, longitude: 138.5 },
      { latitude: 35.5009, longitude: 138.5 },
    ]);
    expect(plan[1]!.north - plan[0]!.north).toBeCloseTo(99.8, 0);
    expect(Math.abs(plan[1]!.east - plan[0]!.east)).toBeLessThan(0.01);
  });
});
