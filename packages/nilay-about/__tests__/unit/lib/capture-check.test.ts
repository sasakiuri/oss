import { describe, expect, it } from 'vitest';

import {
  NATIONAL_LIMITS,
  SHOT_ITEMS,
  boardLines,
  formatExifDate,
  readPhotoMetadata,
  reiwaDate,
  rewardLine,
  rewardTotal,
  type RewardRow,
} from '@/lib/capture-check';

/** A minimal JPEG: SOI, an APP1 Exif segment built from the given IFDs, then EOI. */
function jpegWithExif({
  little = true,
  takenAt,
  gps,
}: {
  little?: boolean;
  takenAt?: string;
  gps?: { lat: [number, number, number]; latRef: string; lon: [number, number, number]; lonRef: string };
}): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (value: number) => (little ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff]);
  const u32 = (value: number) =>
    little
      ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24]
      : [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  // Layout: header (8), IFD0 at 8, Exif IFD, GPS IFD, then the data they point to.
  const ifd0Entries = (takenAt ? 1 : 0) + (gps ? 1 : 0);
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifAt = 8 + ifd0Size;
  const exifSize = takenAt ? 2 + 12 + 4 : 0;
  const gpsAt = exifAt + exifSize;
  const gpsSize = gps ? 2 + 4 * 12 + 4 : 0;
  let dataAt = gpsAt + gpsSize;
  const data: number[] = [];
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(ifd0Entries));
  if (takenAt) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifAt));
  if (gps) tiff.push(...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsAt));
  tiff.push(...u32(0));
  if (takenAt) {
    tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(dataAt), ...u32(0));
    data.push(...Array.from(takenAt, (c) => c.charCodeAt(0)), 0);
    dataAt += 20;
  }
  if (gps) {
    const rationals = (values: [number, number, number]) =>
      values.flatMap((value) => [...u32(Math.round(value * 100)), ...u32(100)]);
    tiff.push(...u16(4));
    tiff.push(...u16(1), ...u16(2), ...u32(2), gps.latRef.charCodeAt(0), 0, 0, 0);
    tiff.push(...u16(2), ...u16(5), ...u32(3), ...u32(dataAt));
    tiff.push(...u16(3), ...u16(2), ...u32(2), gps.lonRef.charCodeAt(0), 0, 0, 0);
    tiff.push(...u16(4), ...u16(5), ...u32(3), ...u32(dataAt + 24));
    tiff.push(...u32(0));
    data.push(...rationals(gps.lat), ...rationals(gps.lon));
  }
  const body = [...Array.from('Exif\0\0', (c) => c.charCodeAt(0)), ...tiff, ...data];
  const length = body.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...body, 0xff, 0xd9]).buffer;
}

describe('the date and position in a photo', () => {
  it('reads the date taken and the GPS position, little-endian', () => {
    const metadata = readPhotoMetadata(
      jpegWithExif({
        takenAt: '2026:09:24 06:30:15',
        gps: { lat: [35, 39, 29.16], latRef: 'N', lon: [139, 44, 28.8], lonRef: 'E' },
      }),
    );
    expect(metadata.takenAt).toBe('2026:09:24 06:30:15');
    expect(metadata.latitude).toBeCloseTo(35.6581, 4);
    expect(metadata.longitude).toBeCloseTo(139.7413333, 6);
    expect(formatExifDate(metadata.takenAt ?? '')).toBe('2026-09-24 06:30');
  });

  it('reads big-endian files and the southern and western hemispheres', () => {
    const metadata = readPhotoMetadata(
      jpegWithExif({ little: false, gps: { lat: [33, 30, 0], latRef: 'S', lon: [70, 15, 0], lonRef: 'W' } }),
    );
    expect(metadata.takenAt).toBeNull();
    expect(metadata.latitude).toBeCloseTo(-33.5, 10);
    expect(metadata.longitude).toBeCloseTo(-70.25, 10);
  });

  it('reports nothing for a file without Exif, a truncated one, or one that is not a JPEG', () => {
    const empty = { takenAt: null, latitude: null, longitude: null };
    expect(readPhotoMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]).buffer)).toEqual(empty);
    expect(readPhotoMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual(empty);
    const whole = new Uint8Array(jpegWithExif({ takenAt: '2026:09:24 06:30:15' }));
    expect(readPhotoMetadata(whole.slice(0, 30).buffer)).toEqual(empty);
  });
});

describe('the board', () => {
  it('keeps the manual’s three items in order and leaves blanks to fill by hand', () => {
    expect(boardLines({ date: ' 令和8年9月24日 ', hunter: '', individual: '○－１' })).toEqual([
      { label: '捕獲日', value: '令和8年9月24日' },
      { label: '捕獲従事者氏名', value: '' },
      { label: '個体番号', value: '○－１' },
    ]);
  });

  it('writes Reiwa dates, with the first year as 元年', () => {
    expect(reiwaDate('2026-09-24')).toBe('令和8年9月24日');
    expect(reiwaDate('2019-05-01')).toBe('令和元年5月1日');
    expect(reiwaDate('2019-04-30')).toBeNull();
    expect(reiwaDate('bad')).toBeNull();
  });

  it('asks for the permit only when captured alone', () => {
    expect(SHOT_ITEMS.filter((item) => item.soloOnly).map((item) => item.id)).toEqual(['permit']);
  });
});

describe('the payment', () => {
  const row = (overrides: Partial<RewardRow>): RewardRow => ({
    id: 'r',
    rewardClass: 'deerBoarGibier',
    label: '',
    nationalYen: 0,
    heads: 1,
    prefectureYen: 0,
    municipalityYen: 0,
    ...overrides,
  });

  it('uses the national upper limits of the FY2026 guideline', () => {
    expect(Object.fromEntries(Object.entries(NATIONAL_LIMITS).map(([key, value]) => [key, value.yen]))).toEqual({
      deerBoarGibier: 9000,
      deerBoarIncineration: 8000,
      deerBoarOther: 7000,
      bearMonkeySerow: 8000,
      otherMammal: 1000,
      bird: 200,
    });
  });

  it('adds the prefecture and municipality to the national amount, per head', () => {
    expect(rewardLine(row({ heads: 3, prefectureYen: 3000, municipalityYen: 5000 }))).toEqual({
      id: 'r',
      perHeadYen: 17000,
      totalYen: 51000,
      nationalTotalYen: 27000,
    });
    // The national amount of a custom row, such as a young animal, is what was entered.
    expect(rewardLine(row({ rewardClass: 'custom', nationalYen: 1000, municipalityYen: 5000 }))?.perHeadYen).toBe(6000);
  });

  it('leaves out rows that are not whole numbers of yen and heads, and says how many', () => {
    const total = rewardTotal([
      row({ heads: 2 }),
      row({ heads: Number.NaN }),
      row({ prefectureYen: 1.5 }),
      row({ municipalityYen: -1 }),
    ]);
    expect(total).toEqual({ totalYen: 18000, heads: 2, invalid: 3 });
  });
});
