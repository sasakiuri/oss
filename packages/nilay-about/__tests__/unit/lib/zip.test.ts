import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { crc32, readZip, writeZip, ZipError } from '@/lib/zip';

const text = (value: string) => new TextEncoder().encode(value);

describe('ZIP', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });

  it('reads back what it wrote, names in UTF-8 included', async () => {
    const archive = writeZip([
      { name: 'doc.kml', data: text('<kml/>') },
      { name: 'files/地図_1.jpg', data: new Uint8Array([1, 2, 3]) },
    ]);
    const entries = readZip(archive);
    expect(entries.map((entry) => entry.name)).toEqual(['doc.kml', 'files/地図_1.jpg']);
    expect(new TextDecoder().decode(await entries[0]!.read())).toBe('<kml/>');
    expect([...(await entries[1]!.read())]).toEqual([1, 2, 3]);
  });

  it('inflates a deflated entry', async () => {
    const original = text('trail camera '.repeat(200));
    const deflated = new Uint8Array(deflateRawSync(original));
    // A stored archive of the deflated bytes, then marked as deflate with the true size and CRC.
    const archive = writeZip([{ name: 'a.txt', data: deflated }]);
    const view = new DataView(archive.buffer);
    const central = archive.length - 22 - (46 + 5);
    for (const [method, crc, size] of [
      [8, 14, 22],
      [central + 10, central + 16, central + 24],
    ] as const) {
      view.setUint16(method, 8, true);
      view.setUint32(crc, crc32(original), true);
      view.setUint32(size, original.length, true);
    }
    const [entry] = readZip(archive);
    expect(entry!.size).toBe(original.length);
    expect(new TextDecoder().decode(await entry!.read())).toBe('trail camera '.repeat(200));
  });

  // The MS-DOS date holds the years 1980 to 2107 in seven bits; outside them the year would wrap.
  it('refuses a modification time the MS-DOS date cannot hold', () => {
    const entries = [{ name: 'a.txt', data: text('a') }];
    expect(() => writeZip(entries, new Date(1970, 0, 1))).toThrow(RangeError);
    expect(() => writeZip(entries, new Date(2108, 0, 1))).toThrow(RangeError);
    const last = new DataView(writeZip(entries, new Date(2107, 11, 31, 23, 59, 58)).buffer);
    expect(last.getUint16(12, true) >> 9).toBe(127);
    const first = new DataView(writeZip(entries, new Date(1980, 0, 1)).buffer);
    expect(first.getUint16(12, true)).toBe((1 << 5) | 1);
  });

  it('refuses what is not an archive', () => {
    expect(() => readZip(text('not a zip at all, just some text'))).toThrow(ZipError);
  });
});
