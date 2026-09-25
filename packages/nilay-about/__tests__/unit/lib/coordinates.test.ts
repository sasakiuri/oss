import { describe, expect, it } from 'vitest';

import {
  formatDms,
  formatMgrs,
  fromPlane,
  fromUtm,
  meshCode,
  meshLevels,
  parseMeshCode,
  parseMgrs,
  planeSystem,
  planeSystems,
  toMgrs,
  toPlane,
  toUtm,
  utmZone,
} from '@/lib/coordinates';

describe('degrees, minutes and seconds', () => {
  it('writes an angle with its hemisphere', () => {
    expect(formatDms(35.681236, 'latitude', 'ja')).toBe('北緯 35°40′52.45″');
    expect(formatDms(-0.5, 'longitude', 'en', 0)).toBe('0°30′00″ W');
  });

  it('carries a second that rounds up to 60', () => {
    expect(formatDms(35 + 59 / 60 + 59.999 / 3600, 'latitude', 'en')).toBe('36°00′00.00″ N');
  });
});

describe('UTM and MGRS', () => {
  it('finds the zone, with the Norway exception', () => {
    expect(utmZone({ latitude: 35.68, longitude: 139.77 })).toBe(54);
    expect(utmZone({ latitude: 60, longitude: 5 })).toBe(32);
    expect(utmZone({ latitude: 78, longitude: 15 })).toBe(33);
  });

  it('gives the MGRS reference commonly published for the Washington Monument', () => {
    // 38.8895° N 77.0352° W is quoted as 18S UJ 23487 06483; the quoted input has four decimals
    // (about 10 m), so the metre digits are not compared.
    const mgrs = toMgrs({ latitude: 38.8895, longitude: -77.0352 })!;
    expect(formatMgrs(mgrs, 4)).toBe('18S UJ 2348 0648');
    expect(formatMgrs(mgrs, 3)).toBe('18S UJ 234 064');
  });

  // A reference names a square, and a point read from it is the square's centre, as GeoTrans and
  // GeographicLib return it; the south-west corner would be up to 70.7 km off at 100 km precision.
  it('reads an MGRS reference to the centre of its square', () => {
    const parsed = parseMgrs('18SUJ2348706483')!;
    expect(parsed.precisionMetres).toBe(1);
    const utm = toUtm(parsed.point, 18)!;
    expect(utm.easting).toBeCloseTo(323487.5, 4);
    expect(utm.northing).toBeCloseTo(4306483.5, 4);
    expect(formatMgrs(toMgrs(parsed.point)!)).toBe('18S UJ 23487 06483');
  });

  it('reads a 100 km reference to the centre of the square', () => {
    const parsed = parseMgrs('54SUE')!;
    expect(parsed.precisionMetres).toBe(100000);
    const utm = toUtm(parsed.point, 54)!;
    expect(utm.easting).toBeCloseTo(350000, 4);
    expect(utm.northing % 100000).toBeCloseTo(50000, 4);
    expect(formatMgrs(toMgrs(parsed.point)!, 0)).toBe('54S UE');
  });

  it('writes a 100 km reference as the zone, band and square alone', () => {
    const mgrs = toMgrs({ latitude: 35.6812, longitude: 139.7671 })!;
    expect(formatMgrs(mgrs, 0)).toBe('54S UE');
    expect(formatMgrs(mgrs, 1)).toMatch(/^54S UE \d \d$/);
    expect(parseMgrs(formatMgrs(mgrs, 0))!.precisionMetres).toBe(100000);
  });

  it.each([
    { latitude: 35.6812, longitude: 139.7671 },
    { latitude: 43.0642, longitude: 141.3469 },
    { latitude: 26.2124, longitude: 127.6809 },
    { latitude: -33.8688, longitude: 151.2093 },
  ])('goes to MGRS and back at %o', (point) => {
    const text = formatMgrs(toMgrs(point)!);
    const parsed = parseMgrs(text)!;
    const back = toMgrs({ latitude: parsed.point.latitude + 1e-7, longitude: parsed.point.longitude + 1e-7 })!;
    expect(formatMgrs(back)).toBe(text);
  });

  it('refuses what is not an MGRS reference', () => {
    expect(parseMgrs('54SUE 88095 49750')).not.toBeNull();
    expect(parseMgrs('61SUE 1 2')).toBeNull();
    expect(parseMgrs('54SIE 1 2')).toBeNull();
    expect(parseMgrs('54SUE 123 45')).toBeNull();
  });

  it('goes to UTM and back', () => {
    const point = { latitude: 35.6812, longitude: 139.7671 };
    const utm = toUtm(point)!;
    expect(utm.zone).toBe(54);
    expect(utm.hemisphere).toBe('N');
    const back = fromUtm(utm);
    expect(back.latitude).toBeCloseTo(point.latitude, 9);
    expect(back.longitude).toBeCloseTo(point.longitude, 9);
    expect(toUtm({ latitude: 85, longitude: 0 })).toBeNull();
  });
});

describe('plane rectangular coordinates', () => {
  it('has the nineteen origins of the notice', () => {
    expect(planeSystems).toHaveLength(19);
    expect(planeSystem(9)?.origin).toEqual({ latitude: 36, longitude: 139 + 50 / 60 });
    expect(planeSystem(18)?.origin).toEqual({ latitude: 20, longitude: 136 });
  });

  // GSI surveycalc bl2xy, JGD2011 zone IX, as in the hunter map tests.
  it('matches the published zone IX values both ways', () => {
    const system = planeSystem(9)!;
    const plane = toPlane({ latitude: 36.5, longitude: 140.2 }, system);
    expect(plane.x).toBeCloseTo(55538.7916, 3);
    expect(plane.y).toBeCloseTo(32846.8514, 3);
    const back = fromPlane({ x: 55538.7916, y: 32846.8514 }, system);
    expect(back.latitude).toBeCloseTo(36.5, 8);
    expect(back.longitude).toBeCloseTo(140.2, 8);
  });
});

/** The Statistics Bureau's own step-by-step formula for a code from a latitude and longitude. */
function bureauCode(latitude: number, longitude: number) {
  const minutes = latitude * 60;
  const p = Math.floor(minutes / 40);
  const a = minutes - p * 40;
  const q = Math.floor(a / 5);
  const b = a - q * 5;
  const r = Math.floor((b * 60) / 30);
  const c = b * 60 - r * 30;
  const s = Math.floor(c / 15);
  const d = c - s * 15;
  const t = Math.floor(d / 7.5);
  const u = Math.floor(longitude - 100);
  const f = longitude - 100 - u;
  const v = Math.floor((f * 60) / 7.5);
  const g = f * 60 - v * 7.5;
  const w = Math.floor((g * 60) / 45);
  const h = g * 60 - w * 45;
  const x = Math.floor(h / 22.5);
  const i = h - x * 22.5;
  const y = Math.floor(i / 11.25);
  const m = s * 2 + (x + 1);
  const n = t * 2 + (y + 1);
  return {
    third: `${p}${u}${q}${v}${r}${w}`,
    half: `${p}${u}${q}${v}${r}${w}${m}`,
    quarter: `${p}${u}${q}${v}${r}${w}${m}${n}`,
  };
}

describe('standard grid squares', () => {
  it.each([
    [35.6812, 139.7671],
    [43.0642, 141.3469],
    [26.2124, 127.6809],
    [36.123456, 138.987654],
  ])('matches the bureau formula at %f, %f', (latitude, longitude) => {
    const expected = bureauCode(latitude, longitude);
    expect(meshCode({ latitude, longitude }, 'third')?.code).toBe(expected.third);
    expect(meshCode({ latitude, longitude }, 'half')?.code).toBe(expected.half);
    expect(meshCode({ latitude, longitude }, 'quarter')?.code).toBe(expected.quarter);
  });

  it('numbers the fivefold and twofold squares as the notice does', () => {
    // The south-west corner of second-level square 543823 is 36°10′ N 138°22′30″ E.
    const corner = { latitude: 36 + 10 / 60, longitude: 138 + 22.5 / 60 };
    const northEast = { latitude: corner.latitude + 4 / 60, longitude: corner.longitude + 6 / 60 };
    expect(meshCode(corner, 'second')?.code).toBe('543823');
    expect(meshCode(corner, 'fivefold')?.code).toBe('5438231');
    expect(meshCode(northEast, 'fivefold')?.code).toBe('5438234');
    expect(meshCode(corner, 'twofold')?.code).toBe('543823005');
    expect(meshCode(northEast, 'twofold')?.code).toBe('543823885');
  });

  it('reads every level back to the square it came from', () => {
    const point = { latitude: 35.6812, longitude: 139.7671 };
    for (const level of meshLevels) {
      const cell = meshCode(point, level)!;
      const parsed = parseMeshCode(cell.code)!;
      expect(parsed.level).toBe(level);
      expect(parsed.south).toBeCloseTo(cell.south, 12);
      expect(parsed.west).toBeCloseTo(cell.west, 12);
      expect(parsed.height).toBeCloseTo(cell.height, 12);
      expect(point.latitude).toBeGreaterThanOrEqual(parsed.south);
      expect(point.latitude).toBeLessThan(parsed.south + parsed.height);
    }
  });

  it('sizes the squares as the notice does', () => {
    const third = parseMeshCode('54382343')!;
    expect(third.height * 3600).toBeCloseTo(30, 9);
    expect(third.width * 3600).toBeCloseTo(45, 9);
    expect(parseMeshCode('5438234')!.height * 60).toBeCloseTo(2.5, 9);
    expect(parseMeshCode('5438234')!.width * 60).toBeCloseTo(3.75, 9);
  });

  it('refuses codes that are not squares, and places outside the grid', () => {
    expect(parseMeshCode('543889')).toBeNull();
    expect(parseMeshCode('5438235')).toBeNull();
    expect(parseMeshCode('543823435')).toBeNull();
    expect(meshCode({ latitude: 10, longitude: 139 }, 'third')).toBeNull();
  });
});
