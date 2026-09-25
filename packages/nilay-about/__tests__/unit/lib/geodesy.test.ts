import { describe, expect, it } from 'vitest';

import { arcPoints, circleRing, compassPoint, directGeodesic, inverseGeodesic } from '@/lib/geodesy';

const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;

// Vincenty's own worked example on GRS80, as Geoscience Australia publishes it: Flinders Peak to Buninyong.
const flindersPeak = { latitude: -dms(37, 57, 3.7203), longitude: dms(144, 25, 29.5244) };
const buninyong = { latitude: -dms(37, 39, 10.1561), longitude: dms(143, 55, 35.3839) };

describe('geodesics on GRS80', () => {
  it('reproduces the published distance and bearings between Flinders Peak and Buninyong', () => {
    const result = inverseGeodesic(flindersPeak, buninyong)!;
    expect(result.distanceMetres).toBeCloseTo(54972.271, 2);
    expect(result.initialBearing).toBeCloseTo(dms(306, 52, 5.37), 4);
    // The published reverse azimuth is 127°10′25.07″, the final bearing turned round.
    expect(result.finalBearing).toBeCloseTo(dms(127, 10, 25.07) + 180, 4);
  });

  it('reaches Buninyong from Flinders Peak on the published bearing and distance', () => {
    const end = directGeodesic(flindersPeak, dms(306, 52, 5.37), 54972.271);
    expect(end.latitude).toBeCloseTo(buninyong.latitude, 7);
    expect(end.longitude).toBeCloseTo(buninyong.longitude, 7);
  });

  it('reads zero between a point and itself', () => {
    expect(inverseGeodesic(buninyong, buninyong)?.distanceMetres).toBe(0);
  });

  it('puts every point of a circle at its radius', () => {
    const centre = { latitude: 35.5, longitude: 138.5 };
    for (const point of circleRing(centre, 1200, 12))
      expect(inverseGeodesic(centre, point)!.distanceMetres).toBeCloseTo(1200, 3);
  });

  it('draws an arc clockwise between two bearings, ends included', () => {
    const centre = { latitude: 35.5, longitude: 138.5 };
    const arc = arcPoints(centre, 350, 10, 500, 5);
    expect(arc).toHaveLength(5);
    expect(inverseGeodesic(centre, arc[0]!)!.initialBearing).toBeCloseTo(350, 6);
    expect(
      Math.min(...[0, 360].map((north) => Math.abs(inverseGeodesic(centre, arc[2]!)!.initialBearing - north))),
    ).toBeLessThan(1e-6);
    expect(inverseGeodesic(centre, arc[4]!)!.initialBearing).toBeCloseTo(10, 6);
  });

  it('names the compass point of a bearing', () => {
    expect(compassPoint(0, 'ja')).toBe('北');
    expect(compassPoint(350, 'en')).toBe('N');
    expect(compassPoint(135, 'ja')).toBe('南東');
    expect(compassPoint(247.5, 'en')).toBe('WSW');
  });
});
