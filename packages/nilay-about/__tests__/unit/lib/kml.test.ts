import { describe, expect, it } from 'vitest';

import { buildKml, splitIntoTiles } from '@/lib/kml';

describe('KML', () => {
  it('writes a ground overlay with its four corners counter-clockwise from the lower left', () => {
    const kml = buildKml(
      'Map & area',
      [
        {
          name: 'map',
          href: 'files/map.jpg',
          corners: {
            lowerLeft: { latitude: 35, longitude: 138 },
            lowerRight: { latitude: 35, longitude: 139 },
            upperRight: { latitude: 36, longitude: 139 },
            upperLeft: { latitude: 36, longitude: 138 },
          },
        },
      ],
      [],
    );
    expect(kml).toContain('<name>Map &amp; area</name>');
    expect(kml).toContain('xmlns:gx="http://www.google.com/kml/ext/2.2"');
    expect(kml).toContain(
      '<coordinates>138.00000000,35.00000000 139.00000000,35.00000000 139.00000000,36.00000000 138.00000000,36.00000000</coordinates>',
    );
    expect(kml).toContain('<href>files/map.jpg</href>');
  });

  it('closes each area ring', () => {
    const kml = buildKml(
      'Areas',
      [],
      [
        {
          name: '鳥獣保護区',
          ring: [
            { latitude: 35, longitude: 138 },
            { latitude: 35, longitude: 138.1 },
            { latitude: 35.1, longitude: 138.1 },
          ],
        },
      ],
    );
    expect(kml).toContain('<name>鳥獣保護区</name>');
    expect(kml).toMatch(/<coordinates>138\.00000000,35\.00000000,0 .* 138\.00000000,35\.00000000,0<\/coordinates>/);
  });
});

describe('cutting a picture into pieces', () => {
  it('covers the picture exactly, in whole pixels', () => {
    const tiles = splitIntoTiles(1001, 700, 3, 2);
    expect(tiles).toHaveLength(6);
    expect(tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0)).toBe(1001 * 700);
    expect(tiles[0]).toMatchObject({ x: 0, y: 0, row: 0, column: 0 });
    expect(tiles.at(-1)).toMatchObject({ x: 667, y: 350, width: 334, height: 350 });
  });
});
