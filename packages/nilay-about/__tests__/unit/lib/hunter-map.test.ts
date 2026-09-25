import { describe, expect, it } from 'vitest';

import {
  effectiveModel,
  fitGeoreference,
  fitPlane,
  geoToImage,
  eraYear,
  fiscalYearEnded,
  imageToGeo,
  isInsideImage,
  parseCoordinate,
  project,
  unproject,
  zoneProximity,
  type GeoPoint,
  type ReferencePair,
} from '@/lib/hunter-map';
import { inverseTransverseMercator, transverseMercator } from '@/lib/transverse-mercator';

describe('transverse Mercator', () => {
  // Zone IX of the plane rectangular coordinate system: origin 36° N 139°50′ E, scale 0.9999.
  // Expected values from the Geospatial Information Authority of Japan's own calculation service
  // (surveycalc bl2xy, JGD2011, zone 9), fetched on 2026-09-23.
  const zone9 = { latitude: 36, longitude: 139 + 50 / 60 };
  it.each([
    [36.5, 140.2, 55538.7916, 32846.8514],
    [35.0, 139.0, -110621.3733, -76066.7927],
    [37.2, 141.1, 133902.4306, 112443.3681],
    [36.0, 139 + 50 / 60, 0, 0],
  ])('puts %f N %f E at the published plane coordinates', (latitude, longitude, x, y) => {
    const result = transverseMercator({ latitude, longitude }, zone9, 0.9999);
    expect(result.x).toBeCloseTo(x, 3);
    expect(result.y).toBeCloseTo(y, 3);
  });

  it.each([
    [36.5, 140.2, 55538.7916, 32846.8514],
    [35.0, 139.0, -110621.3733, -76066.7927],
    [37.2, 141.1, 133902.4306, 112443.3681],
  ])('reads %f N %f E back from the published plane coordinates', (latitude, longitude, x, y) => {
    const result = inverseTransverseMercator({ x, y }, zone9, 0.9999);
    // 1e-8 degrees is about a millimetre; the published plane values are given to 0.1 mm.
    expect(result.latitude).toBeCloseTo(latitude, 8);
    expect(result.longitude).toBeCloseTo(longitude, 8);
  });
});

describe('parsing a latitude or longitude', () => {
  it.each([
    ['35.6812', 35.6812],
    ['35°40′52.3″', 35 + 40 / 60 + 52.3 / 3600],
    ['35 40 52.3', 35 + 40 / 60 + 52.3 / 3600],
    ['35度40分52.3秒', 35 + 40 / 60 + 52.3 / 3600],
    ['35:40', 35 + 40 / 60],
    ['北緯35.5', 35.5],
    ['N35.5', 35.5],
    ['35.5S', -35.5],
    ['-35.5', -35.5],
    ['３５．５', 35.5],
    ['90', 90],
  ])('reads %s as a latitude', (text, expected) => {
    expect(parseCoordinate(text, 'latitude')).toBeCloseTo(expected, 10);
  });

  it.each(['', '90.0001', '35 60', '35 40 60', '35.5 12', 'abc', 'N-35', '35 40 52 1', 'E35'])(
    'refuses %j as a latitude',
    (text) => {
      expect(parseCoordinate(text, 'latitude')).toBeNull();
    },
  );

  it('allows longitudes up to 180 and reads west as negative', () => {
    expect(parseCoordinate('139°45′', 'longitude')).toBeCloseTo(139.75, 10);
    expect(parseCoordinate('180', 'longitude')).toBe(180);
    expect(parseCoordinate('180.1', 'longitude')).toBeNull();
    expect(parseCoordinate('西経 75.5', 'longitude')).toBe(-75.5);
    expect(parseCoordinate('N35', 'longitude')).toBeNull();
  });
});

describe('fitting a plane transform', () => {
  const square = [
    { u: 0, v: 0 },
    { u: 1000, v: 0 },
    { u: 0, v: 1000 },
    { u: 1000, v: 1000 },
  ];

  it('spreads one displaced corner of a square over all four by least squares', () => {
    // Image = 0.5 px/m plus a shift, with the last corner 8 px too far right. The residual of a
    // square under an affine fit is the displacement projected on (1, −1, −1, 1): 8/4 = 2 px at
    // each corner, so the fitted x is 98, 602, 102 and 606 and the transform is a = 0.504, b = 0.004.
    const pairs = square.map((plane, index) => ({
      plane,
      image: { x: 0.5 * plane.u + 100 + (index === 3 ? 8 : 0), y: 0.5 * plane.v + 200 },
    }));
    const fit = fitPlane(pairs, 'affine');
    expect(fit.status).toBe('ok');
    if (fit.status !== 'ok') return;
    expect(fit.transform.a).toBeCloseTo(0.504, 10);
    expect(fit.transform.b).toBeCloseTo(0.004, 10);
    expect(fit.transform.c).toBeCloseTo(98, 8);
    expect(fit.transform.d).toBeCloseTo(0, 10);
    expect(fit.transform.e).toBeCloseTo(0.5, 10);
    expect(fit.transform.f).toBeCloseTo(200, 8);
  });

  it('recovers a quarter turn with two points', () => {
    // A picture turned 90° clockwise: east runs down the page and south runs left.
    const fit = fitPlane(
      [
        { plane: { u: 0, v: 0 }, image: { x: 500, y: 500 } },
        { plane: { u: 100, v: 0 }, image: { x: 500, y: 700 } },
      ],
      'similarity',
    );
    expect(fit.status).toBe('ok');
    if (fit.status !== 'ok') return;
    expect(fit.transform.a).toBeCloseTo(0, 12);
    expect(fit.transform.d).toBeCloseTo(2, 12);
    expect(fit.transform.b).toBeCloseTo(-2, 12);
    expect(fit.transform.e).toBeCloseTo(0, 12);
  });

  it('refuses points on one spot and an affine fit along a line', () => {
    expect(
      fitPlane(
        [
          { plane: { u: 0, v: 0 }, image: { x: 0, y: 0 } },
          { plane: { u: 0.1, v: 0.2 }, image: { x: 500, y: 500 } },
        ],
        'similarity',
      ).status,
    ).toBe('coincident');
    const line = [0, 1, 2].map((index) => ({
      plane: { u: index * 1000, v: index * 1000 },
      image: { x: index * 100, y: index * 100 },
    }));
    expect(fitPlane(line, 'affine').status).toBe('collinear');
    expect(fitPlane(line, 'similarity').status).toBe('ok');
  });

  it('refuses a fit with fewer points than it needs', () => {
    expect(() =>
      fitPlane(
        square.slice(0, 2).map((plane) => ({ plane, image: { x: plane.u, y: plane.v } })),
        'affine',
      ),
    ).toThrow();
  });
});

describe('aligning a map by its reference points', () => {
  const origin = { latitude: 35.5, longitude: 138.5 };
  // A map at 1 px per 10 m, north up, drawn in Transverse Mercator.
  const drawTm = (geo: GeoPoint) => {
    const { x, y } = transverseMercator(geo, origin);
    return { x: 2000 + y / 10, y: 2000 - x / 10 };
  };
  const corners: GeoPoint[] = [
    { latitude: 35.4, longitude: 138.4 },
    { latitude: 35.4, longitude: 138.6 },
    { latitude: 35.6, longitude: 138.4 },
    { latitude: 35.6, longitude: 138.6 },
  ];
  const pairsOn = (draw: (geo: GeoPoint) => { x: number; y: number }, points: GeoPoint[]): ReferencePair[] =>
    points.map((geo) => ({ geo, image: draw(geo) }));

  it('needs two complete points and fits a similarity until there are three', () => {
    expect(fitGeoreference([], 'affine', 'transverse-mercator')).toEqual({ status: 'too-few', needed: 2 });
    const two = fitGeoreference(pairsOn(drawTm, corners.slice(0, 2)), 'affine', 'transverse-mercator');
    expect(two.status === 'ok' && two.model).toBe('similarity');
    expect(effectiveModel('affine', 2)).toBe('similarity');
    expect(effectiveModel('affine', 3)).toBe('affine');
    expect(effectiveModel('similarity', 5)).toBe('similarity');
  });

  it('cannot check itself with only as many points as it needs', () => {
    const three = fitGeoreference(pairsOn(drawTm, corners.slice(0, 3)), 'affine', 'transverse-mercator');
    expect(three.status).toBe('ok');
    if (three.status !== 'ok') return;
    expect(three.checkable).toBe(false);
    expect(three.rmsMetres).toBeCloseTo(0, 6);
  });

  it('places a new position on a map drawn in the same projection', () => {
    const fit = fitGeoreference(pairsOn(drawTm, corners), 'affine', 'transverse-mercator');
    expect(fit.status).toBe('ok');
    if (fit.status !== 'ok') return;
    expect(fit.checkable).toBe(true);
    expect(fit.mirrored).toBe(false);
    // The map's scale is 0.1 px per metre, and the fit is exact up to the difference in the origin.
    expect(fit.pixelsPerMetre).toBeCloseTo(0.1, 4);
    expect(fit.maxMetres).toBeLessThan(0.5);
    const inside = { latitude: 35.47, longitude: 138.55 };
    const placed = geoToImage(fit, inside);
    const expected = drawTm(inside);
    expect(Math.hypot(placed.x - expected.x, placed.y - expected.y)).toBeLessThan(0.05);
  });

  it('shows a large residual when the projection does not match the map', () => {
    // A web-map screen: x and y proportional to longitude and to ln tan(π/4 + φ/2), on the sphere.
    const drawWeb = (geo: GeoPoint) => ({
      x: 10000 * geo.longitude,
      y: -10000 * (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (geo.latitude * Math.PI) / 360)),
    });
    const wide: GeoPoint[] = [
      { latitude: 34, longitude: 135 },
      { latitude: 34, longitude: 137 },
      { latitude: 36, longitude: 135 },
      { latitude: 36, longitude: 137 },
      { latitude: 35, longitude: 136 },
    ];
    const matched = fitGeoreference(pairsOn(drawWeb, wide), 'similarity', 'web-mercator');
    const mismatched = fitGeoreference(pairsOn(drawWeb, wide), 'similarity', 'transverse-mercator');
    expect(matched.status === 'ok' && matched.maxMetres).toBeLessThan(0.5);
    // Over two degrees of latitude the Mercator scale changes by some 5%, which a similarity cannot take up.
    expect(mismatched.status === 'ok' && mismatched.maxMetres).toBeGreaterThan(100);
  });

  it('flags a map fitted as a mirror image, as when latitude and longitude are swapped', () => {
    const swapped = corners.slice(0, 3).map((geo) => ({
      geo: { latitude: geo.latitude, longitude: geo.longitude },
      image: (() => {
        const plane = project(geo, origin, 'transverse-mercator');
        return { x: 2000 - plane.v / 10, y: 2000 - plane.u / 10 };
      })(),
    }));
    const fit = fitGeoreference(swapped, 'affine', 'transverse-mercator');
    expect(fit.status === 'ok' && fit.mirrored).toBe(true);
  });

  it('reports points that do not spread across the map', () => {
    const line: GeoPoint[] = [0, 1, 2].map((step) => ({ latitude: 35 + step * 0.1, longitude: 138 + step * 0.1 }));
    expect(fitGeoreference(pairsOn(drawTm, line), 'affine', 'transverse-mercator').status).toBe('collinear');
  });

  it('knows the edges of the picture', () => {
    const size = { width: 100, height: 50 };
    expect(isInsideImage({ x: 0, y: 0 }, size)).toBe(true);
    expect(isInsideImage({ x: 100, y: 50 }, size)).toBe(true);
    expect(isInsideImage({ x: 100.1, y: 10 }, size)).toBe(false);
    expect(isInsideImage({ x: 10, y: -0.1 }, size)).toBe(false);
  });
});

describe('the limits of Web Mercator', () => {
  it('refuses a pole instead of fitting to infinity', () => {
    const pairs = [
      { geo: { latitude: 90, longitude: 138 }, image: { x: 0, y: 0 } },
      { geo: { latitude: 35, longitude: 139 }, image: { x: 500, y: 500 } },
    ];
    expect(fitGeoreference(pairs, 'affine', 'web-mercator')).toEqual({ status: 'out-of-range' });
    // Transverse Mercator reaches the pole on its own meridian, so the same points still fit there.
    expect(fitGeoreference(pairs, 'affine', 'transverse-mercator').status).toBe('ok');
  });
});

describe('from the picture back to the ground', () => {
  it.each(['transverse-mercator', 'web-mercator'] as const)('undoes the %s projection', (projection) => {
    const origin = { latitude: 35.5, longitude: 138.5 };
    const point = { latitude: 35.62, longitude: 138.31 };
    const back = unproject(project(point, origin, projection), origin, projection);
    expect(back.latitude).toBeCloseTo(point.latitude, 9);
    expect(back.longitude).toBeCloseTo(point.longitude, 9);
  });

  it('puts a pixel back on the ground where the fit placed it', () => {
    const pairs: ReferencePair[] = [
      { image: { x: 100, y: 100 }, geo: { latitude: 35.52, longitude: 138.48 } },
      { image: { x: 900, y: 120 }, geo: { latitude: 35.52, longitude: 138.56 } },
      { image: { x: 880, y: 700 }, geo: { latitude: 35.47, longitude: 138.56 } },
      { image: { x: 90, y: 690 }, geo: { latitude: 35.47, longitude: 138.48 } },
    ];
    const fit = fitGeoreference(pairs, 'affine', 'transverse-mercator');
    if (fit.status !== 'ok') throw new Error('fit failed');
    const ground = { latitude: 35.5, longitude: 138.51 };
    const back = imageToGeo(fit, geoToImage(fit, ground))!;
    expect(back.latitude).toBeCloseTo(ground.latitude, 9);
    expect(back.longitude).toBeCloseTo(ground.longitude, 9);
  });
});

describe('the year a map is for', () => {
  it('runs from April to the next March', () => {
    expect(fiscalYearEnded(2025, { year: 2026, month: 3 })).toBe(false);
    expect(fiscalYearEnded(2025, { year: 2026, month: 4 })).toBe(true);
    expect(fiscalYearEnded(2026, { year: 2026, month: 9 })).toBe(false);
  });

  it('names the era year', () => {
    expect(eraYear(2025)).toEqual({ era: '令和', year: 7 });
    expect(eraYear(2019)).toEqual({ era: '令和', year: 1 });
    expect(eraYear(2018)).toEqual({ era: '平成', year: 30 });
  });
});

describe('a position against a traced area', () => {
  // 1 px per metre, north up, around 35.5° N 138.5° E.
  const origin = { latitude: 35.5, longitude: 138.5 };
  const pixel = (geo: GeoPoint) => {
    const { u, v } = project(geo, origin, 'transverse-mercator');
    return { x: 5000 + u, y: 5000 + v };
  };
  const pairs: ReferencePair[] = [
    { latitude: 35.48, longitude: 138.48 },
    { latitude: 35.48, longitude: 138.52 },
    { latitude: 35.52, longitude: 138.52 },
    { latitude: 35.52, longitude: 138.48 },
  ].map((geo) => ({ geo, image: pixel(geo) }));
  const fit = fitGeoreference(pairs, 'affine', 'transverse-mercator');
  if (fit.status !== 'ok') throw new Error('fit failed');
  // A 200 m square centred on the origin.
  const square = [
    { x: 4900, y: 4900 },
    { x: 5100, y: 4900 },
    { x: 5100, y: 5100 },
    { x: 4900, y: 5100 },
  ];

  it('is inside at the centre, 100 m from the edge', () => {
    const result = zoneProximity(fit, square, origin)!;
    expect(result.inside).toBe(true);
    expect(result.distanceMetres).toBeCloseTo(100, 0);
  });

  it('is outside 300 m east, 200 m from the edge', () => {
    const east = unproject({ u: 300, v: 0 }, origin, 'transverse-mercator');
    const result = zoneProximity(fit, square, east)!;
    expect(result.inside).toBe(false);
    expect(result.distanceMetres).toBeCloseTo(200, 0);
  });
});
