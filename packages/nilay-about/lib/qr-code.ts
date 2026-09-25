/**
 * A QR code (ISO/IEC 18004, Model 2) for a short piece of text, drawn in the browser.
 *
 * Only what the Labs tools print is supported: byte mode with the text as UTF-8, error correction
 * level M, versions 1 to 10 (up to 213 bytes). The mask is chosen by the standard's penalty rules,
 * so the same text always gives the same symbol.
 *
 * The block layout, module placement and penalty scoring follow the structure of Project Nayuki's
 * QR Code generator library, cut down to the case above:
 *
 * @license QR Code generator library (TypeScript)
 * Copyright (c) Project Nayuki.
 * SPDX-License-Identifier: MIT
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in all copies or
 *   substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or implied, including but
 *   not limited to the warranties of merchantability, fitness for a particular purpose and
 *   noninfringement. In no event shall the authors or copyright holders be liable for any claim,
 *   damages or other liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the Software.
 */

/** Error correction codewords per block, and the number of blocks, at level M for versions 1–10. */
const ECC_CODEWORDS_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26] as const;
const ERROR_CORRECTION_BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] as const;
/** The format information's two bits for level M. */
const LEVEL_M_FORMAT_BITS = 0;
export const QR_MAX_VERSION = 10;

export interface QrCode {
  version: number;
  size: number;
  /** `modules[y][x]` is true for a dark module. */
  modules: boolean[][];
}

const numRawDataModules = (version: number) => {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
};

const numDataCodewords = (version: number) =>
  Math.floor(numRawDataModules(version) / 8) -
  ECC_CODEWORDS_PER_BLOCK[version - 1]! * ERROR_CORRECTION_BLOCKS[version - 1]!;

/** The byte count the text takes, which decides the version. */
export const qrByteLength = (text: string) => new TextEncoder().encode(text).length;

/** The largest number of bytes a version-10 symbol at level M holds in byte mode. */
export const QR_MAX_BYTES = numDataCodewords(QR_MAX_VERSION) - 3;

const gfMultiply = (x: number, y: number) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};

const reedSolomonDivisor = (degree: number) => {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
};

const reedSolomonRemainder = (data: readonly number[], divisor: readonly number[]) => {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index]! ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
};

const alignmentPositions = (version: number, size: number) => {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < numAlign; position -= step) result.splice(1, 0, position);
  return result;
};

const bit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The data codewords: mode, count, the bytes, the terminator and the pad bytes. */
function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  const capacity = numDataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  return codewords;
}

/** Splits the data into blocks, adds each block's error correction, and interleaves them. */
function interleave(data: readonly number[], version: number): number[] {
  const numBlocks = ERROR_CORRECTION_BLOCKS[version - 1]!;
  const eccLength = ECC_CODEWORDS_PER_BLOCK[version - 1]!;
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLength = Math.floor(rawCodewords / numBlocks);
  const divisor = reedSolomonDivisor(eccLength);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const block = data.slice(k, k + shortBlockLength - eccLength + (i < numShortBlocks ? 0 : 1));
    k += block.length;
    const ecc = reedSolomonRemainder(block, divisor);
    if (i < numShortBlocks) block.push(0);
    blocks.push([...block, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((block, j) => {
      if (i !== shortBlockLength - eccLength || j >= numShortBlocks) result.push(block[i]!);
    });
  return result;
}

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function penaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let result = 0;
  const addHistory = (runLength: number, history: number[]) => {
    const length = history[0] === 0 ? runLength + size : runLength;
    history.pop();
    history.unshift(length);
  };
  const countPatterns = (history: number[]) => {
    const n = history[1]!;
    const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (
      (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) +
      (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0)
    );
  };
  const terminate = (color: boolean, runLength: number, history: number[]) => {
    let length = runLength;
    if (color) {
      addHistory(length, history);
      length = 0;
    }
    addHistory(length + size, history);
    return countPatterns(history);
  };
  const scanLines = (at: (line: number, index: number) => boolean) => {
    for (let line = 0; line < size; line++) {
      let color = false;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let index = 0; index < size; index++) {
        if (at(line, index) === color) {
          run++;
          if (run === 5) result += PENALTY_N1;
          else if (run > 5) result++;
        } else {
          addHistory(run, history);
          if (!color) result += countPatterns(history) * PENALTY_N3;
          color = at(line, index);
          run = 1;
        }
      }
      result += terminate(color, run, history) * PENALTY_N3;
    }
  };
  scanLines((y, x) => modules[y]![x]!);
  scanLines((x, y) => modules[y]![x]!);
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y]![x];
      if (color === modules[y]![x + 1] && color === modules[y + 1]![x] && color === modules[y + 1]![x + 1])
        result += PENALTY_N2;
    }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY_N4;
  return result;
}

/**
 * The symbol for `text`, in the smallest version that holds it, or `null` for text that is empty
 * or longer than {@link QR_MAX_BYTES} bytes.
 */
export function encodeQrCode(text: string): QrCode | null {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length === 0) return null;
  let version = 1;
  // Mode (4 bits), the count (8 or 16 bits) and the data must fit the data codewords.
  while (version <= QR_MAX_VERSION && 4 + (version <= 9 ? 8 : 16) + bytes.length * 8 > numDataCodewords(version) * 8)
    version++;
  if (version > QR_MAX_VERSION) return null;

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y]![x] = dark;
    isFunction[y]![x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, distance !== 2 && distance !== 4);
      }
  const positions = alignmentPositions(version, size);
  const last = positions.length - 1;
  positions.forEach((cx, i) =>
    positions.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );

  const drawFormatBits = (mask: number) => {
    const data = (LEVEL_M_FORMAT_BITS << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const bits = ((data << 10) | remainder) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
    set(8, 7, bit(bits, 6));
    set(8, 8, bit(bits, 7));
    set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
    set(8, size - 8, true);
  };
  drawFormatBits(0);
  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (version << 12) | remainder;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(bits, i));
      set(b, a, bit(bits, i));
    }
  }

  const codewords = interleave(dataCodewords(bytes, version), version);
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!isFunction[y]![x] && index < codewords.length * 8) {
          modules[y]![x] = bit(codewords[index >>> 3]!, 7 - (index & 7));
          index++;
        }
      }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if (!isFunction[y]![x] && MASKS[mask]!(x, y)) modules[y]![x] = !modules[y]![x];
  };
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < MASKS.length; mask++) {
    applyMask(mask);
    drawFormatBits(mask);
    const penalty = penaltyScore(modules);
    if (penalty < bestPenalty) {
      bestMask = mask;
      bestPenalty = penalty;
    }
    applyMask(mask);
  }
  applyMask(bestMask);
  drawFormatBits(bestMask);
  return { version, size, modules };
}

/**
 * The dark modules as one SVG path in module units, with the four-module quiet zone the standard
 * asks for around the symbol. The caller sets the viewBox to `0 0 size+8 size+8`.
 */
export function qrCodePath(code: QrCode): string {
  const parts: string[] = [];
  code.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + 4} ${y + 4}h1v1h-1z`);
    }),
  );
  return parts.join('');
}
