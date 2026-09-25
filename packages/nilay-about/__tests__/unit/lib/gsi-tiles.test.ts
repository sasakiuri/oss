import { describe, expect, it } from 'vitest';

import { baseLayers, fitView, fromWorld, metresPerPixel, tilesForView, toWorld } from '@/lib/gsi-tiles';

describe('Web Mercator pixels', () => {
  it('puts the equator and the prime meridian at the middle of the world map', () => {
    expect(toWorld({ latitude: 0, longitude: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(toWorld({ latitude: 0, longitude: -180 }, 1).x).toBe(0);
  });

  it('comes back to the same latitude and longitude', () => {
    const point = { latitude: 35.6812, longitude: 139.7671 };
    const back = fromWorld(toWorld(point, 17.3), 17.3);
    expect(back.latitude).toBeCloseTo(point.latitude, 10);
    expect(back.longitude).toBeCloseTo(point.longitude, 10);
  });

  it('gives the ground size of a pixel', () => {
    // 156,543.03 m per pixel at the equator on level 0.
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03, 2);
    expect(metresPerPixel(60, 1)).toBeCloseTo(156543.03 / 4, 2);
  });
});

describe('the tiles for a view', () => {
  it('asks GSI for the standard map tile that holds the point, at the nearest level', () => {
    const centre = { latitude: 35.6812, longitude: 139.7671 };
    const tiles = tilesForView(baseLayers.std, centre, 15, 256, 256);
    const world = toWorld(centre, 15);
    const holding = `std/15/${Math.floor(world.x / 256)}/${Math.floor(world.y / 256)}`;
    expect(tiles.map((tile) => tile.key)).toContain(holding);
    expect(tiles[0]!.url).toMatch(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/std\/15\/\d+\/\d+\.png$/);
    // Every tile of a 256-pixel view overlaps it.
    for (const tile of tiles) {
      expect(tile.left).toBeLessThan(256);
      expect(tile.left + tile.size).toBeGreaterThan(0);
    }
  });

  it('asks for nothing further out than a layer is served', () => {
    const centre = { latitude: 35.6812, longitude: 139.7671 };
    expect(tilesForView(baseLayers.photo, centre, 10, 400, 400)).toEqual([]);
    expect(tilesForView(baseLayers.std, centre, 3.9, 400, 400)).toEqual([]);
    const photo = tilesForView(baseLayers.photo, centre, 13.6, 400, 400);
    expect(photo.length).toBeGreaterThan(0);
    expect(photo[0]!.url).toContain('/seamlessphoto/14/');
  });

  it('scales tiles between levels', () => {
    const tiles = tilesForView(baseLayers.pale, { latitude: 35, longitude: 138 }, 12.4, 300, 300);
    expect(tiles[0]!.size).toBeCloseTo(256 * 2 ** 0.4, 6);
  });
});

describe('fitting a view', () => {
  it('fits two points with room at the edges', () => {
    const a = { latitude: 35.5, longitude: 138.5 };
    const b = { latitude: 35.52, longitude: 138.56 };
    const view = fitView([a, b], 400, 300, 32)!;
    const pa = toWorld(a, view.zoom);
    const pb = toWorld(b, view.zoom);
    expect(Math.abs(pb.x - pa.x)).toBeLessThanOrEqual(400 - 64 + 1e-6);
    expect(Math.abs(pb.y - pa.y)).toBeLessThanOrEqual(300 - 64 + 1e-6);
  });

  it('shows a single point at street level', () => {
    expect(fitView([{ latitude: 35, longitude: 138 }], 400, 300)?.zoom).toBe(15);
    expect(fitView([], 400, 300)).toBeNull();
  });
});
