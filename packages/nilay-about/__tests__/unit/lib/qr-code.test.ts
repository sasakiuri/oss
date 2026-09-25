import { describe, expect, it } from 'vitest';

import { QR_MAX_BYTES, encodeQrCode, qrByteLength, qrCodePath } from '@/lib/qr-code';

const picture = (text: string) =>
  encodeQrCode(text)!.modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));

describe('encodeQrCode', () => {
  // Reference symbols from an independent encoder (Project Nayuki's QR Code generator, as bundled in
  // qrcode.react 4.2.0) at level M in byte mode, without raising the error correction level.
  it('matches an independent encoder, mask choice included', () => {
    expect(picture('hello world')).toEqual([
      '#######..#.##.#######',
      '#.....#...#...#.....#',
      '#.###.#.####..#.###.#',
      '#.###.#.###.#.#.###.#',
      '#.###.#.#.#.#.#.###.#',
      '#.....#.#..#..#.....#',
      '#######.#.#.#.#######',
      '........#.#..........',
      '#.#####..#.#..#####..',
      '.##.##.#.#.########.#',
      '#.#.####.##.###..###.',
      '#.#..#...#.###..###..',
      '...#.#####..###.....#',
      '........#.#.#...##..#',
      '#######....#..#...##.',
      '#.....#.#....#.#.####',
      '#.###.#.#..#..##....#',
      '#.###.#.##..######...',
      '#.###.#.##..#..#..#..',
      '#.....#..##.##..###..',
      '#######.##.##.#.#..#.',
    ]);
    expect(picture('shika-0042')).toEqual([
      '#######.#..##.#######',
      '#.....#.#.#...#.....#',
      '#.###.#.#.###.#.###.#',
      '#.###.#..##...#.###.#',
      '#.###.#.#...#.#.###.#',
      '#.....#....##.#.....#',
      '#######.#.#.#.#######',
      '..........###........',
      '#..######.#.##..#.###',
      '.###....##..#.##.....',
      '.#..####......##.####',
      '.###.....###....#.###',
      '#.########.....###.##',
      '........#####.###....',
      '#######.#.#.##.####..',
      '#.....#.#.###.#####..',
      '#.###.#.#.####..##...',
      '#.###.#.#####....#...',
      '#.###.#...#..#.##..##',
      '#.....#..#...###.####',
      '#######.####.#.##....',
    ]);
  });

  it('picks the smallest version that holds the UTF-8 bytes', () => {
    expect(encodeQrCode('a'.repeat(14))!.version).toBe(1);
    expect(encodeQrCode('a'.repeat(15))!.version).toBe(2);
    // Each of these characters takes three bytes in UTF-8.
    expect(qrByteLength('シカ')).toBe(6);
    expect(encodeQrCode('シカ'.repeat(3))!.version).toBe(2);
    const largest = encodeQrCode('r'.repeat(QR_MAX_BYTES))!;
    expect(largest.version).toBe(10);
    expect(largest.size).toBe(57);
  });

  it('refuses empty text and text beyond version 10', () => {
    expect(QR_MAX_BYTES).toBe(213);
    expect(encodeQrCode('')).toBeNull();
    expect(encodeQrCode('r'.repeat(QR_MAX_BYTES + 1))).toBeNull();
  });

  it('draws the dark modules inside a four-module quiet zone', () => {
    const code = encodeQrCode('a')!;
    const path = qrCodePath(code);
    const dark = code.modules.flat().filter(Boolean).length;
    expect(path.match(/M/g)).toHaveLength(dark);
    // The top-left module of the finder pattern is dark and sits after the quiet zone.
    expect(path.startsWith('M4 4h1v1h-1z')).toBe(true);
  });
});
