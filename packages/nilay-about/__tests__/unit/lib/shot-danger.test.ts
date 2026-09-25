import { describe, expect, it } from 'vitest';

import { inverseGeodesic } from '@/lib/geodesy';
import { shotDangerSettingsSchema } from '@/lib/schemas/shot-danger';
import { coneDangerZone, pamphletRows } from '@/lib/shot-danger';

const firing = { latitude: 35.5, longitude: 138.5 };
const bearingTo = (point: { latitude: number; longitude: number }) => inverseGeodesic(firing, point)!;
const angleFrom = (bearing: number, point: { latitude: number; longitude: number }) =>
  ((bearingTo(point).initialBearing - bearing + 540) % 360) - 180;

describe('the cone danger zone of DA PAM 385-63 figure 4-1', () => {
  const zone = coneDangerZone(firing, 45, '12-gauge-slug')!;

  it('runs out to Distance X of table 4-1 for a 12-gauge slug: 1,073 m', () => {
    expect(zone.distanceXMetres).toBe(1073);
    for (const point of zone.dispersion.slice(1)) expect(bearingTo(point).distanceMetres).toBeCloseTo(1073, 3);
    expect(bearingTo(zone.lineOfFire[1]!).distanceMetres).toBeCloseTo(1073, 3);
  });

  it('runs out to Distance X of table 4-3 for .22 LR: 1,400 m', () => {
    const rimfire = coneDangerZone(firing, 45, '22-lr')!;
    expect(rimfire.distanceXMetres).toBe(1400);
    expect(bearingTo(rimfire.lineOfFire[1]!).distanceMetres).toBeCloseTo(1400, 3);
  });

  it('spreads the dispersion area 5° either side of the line of fire', () => {
    const arc = zone.dispersion.slice(1);
    expect(angleFrom(45, arc[0]!)).toBeCloseTo(-5, 6);
    expect(angleFrom(45, arc.at(-1)!)).toBeCloseTo(5, 6);
  });

  it('puts the ricochet areas in the next 5° on each side', () => {
    expect(angleFrom(45, zone.ricochet.right[1]!)).toBeCloseTo(5, 6);
    expect(angleFrom(45, zone.ricochet.right.at(-1)!)).toBeCloseTo(10, 6);
    expect(angleFrom(45, zone.ricochet.left[1]!)).toBeCloseTo(-10, 6);
  });

  it('opens Area A at 30° and keeps it the table’s 100 m outside the ricochet edge', () => {
    const [, corner, far] = zone.areaA.right;
    expect(angleFrom(45, corner!)).toBeCloseTo(30, 5);
    const lateral = (point: { latitude: number; longitude: number }) =>
      bearingTo(point).distanceMetres * Math.sin(((angleFrom(45, point) - 10) * Math.PI) / 180);
    expect(lateral(corner!)).toBeCloseTo(100, 2);
    expect(lateral(far!)).toBeCloseTo(100, 2);
    expect(bearingTo(far!).distanceMetres).toBeCloseTo(1073, 3);
    expect(angleFrom(45, zone.areaA.left[1]!)).toBeCloseTo(-30, 5);
  });

  it('draws no cone for 12-gauge 7½, 8 and 9 shot, which the pamphlet sends to figure 4-8 instead', () => {
    const shot = pamphletRows.find((row) => row.id === '12-gauge-shot')!;
    expect(shot).toMatchObject({ distanceXMetres: 275, areaAMetres: null, figure: '4-8' });
    expect(coneDangerZone(firing, 0, '12-gauge-shot')).toBeNull();
  });

  it('takes no Distance X other than the table’s', () => {
    // @ts-expect-error A distance of the caller's own is not a row of the tables.
    expect(coneDangerZone(firing, 0, 500)).toBeNull();
  });

  it('draws nothing without a bearing', () => {
    expect(coneDangerZone(firing, Number.NaN, '12-gauge-slug')).toBeNull();
  });
});

describe('the saved settings', () => {
  it('keep no reduced dispersion, which paragraph 4-1 d ties to range training under an approved risk assessment', () => {
    const base = { ammunition: '12-gauge-slug', firing: null, bearing: 0 };
    expect(shotDangerSettingsSchema.safeParse(base).success).toBe(true);
    expect(shotDangerSettingsSchema.safeParse({ ...base, dispersion: 2 }).success).toBe(false);
    expect(shotDangerSettingsSchema.safeParse({ ...base, ammunition: '12-gauge-shot' }).success).toBe(false);
  });
});
