// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { BPT216CoordinateConverter } from '@/main/modules/target/adapters/bpt216/BPT216CoordinateConverter';
import { BPT216DataParser } from '@/main/modules/target/adapters/bpt216/BPT216DataParser';

describe('BPT216DataParser', () => {
  const parser = new BPT216DataParser();

  it('parses a terminal shot with hundredths-formatted score and signed coordinates', () => {
    expect(parser.parse(Buffer.from('10.90,123,-456,0,0,T'))).toEqual({
      scoreTenths: 109,
      xRaw: 123,
      yRaw: -456,
      reserved1: '0',
      reserved2: '0',
    });
  });

  it('normalizes a trailing zero to one-decimal score precision', () => {
    expect(parser.parse(Buffer.from('9.70,-1,+2,a,b,T,2.01'))).toMatchObject({
      scoreTenths: 97,
      xRaw: -1,
      yRaw: 2,
      version: '2.01',
    });
  });

  it.each(['R', 'B'] as const)('does not parse non-shot state %s', (state) => {
    expect(() => parser.parse(Buffer.from(`0.0,0,0,0,0,${state}`))).toThrow();
  });

  it('normalizes scores below the 1-ring to a miss like the official application', () => {
    expect(parser.parse(Buffer.from('0.90,8500,0,0,0,T')).scoreTenths).toBe(0);
  });

  it.each(['9.75,0,0,0,0,T', '11.0,0,0,0,0,T', '9.7,1.2,0,0,0,T', '9.7,0,0,0,0,X', '9.7,0,0,T'])(
    'rejects invalid frame %s',
    (frame) => {
      expect(() => parser.parse(Buffer.from(frame))).toThrow();
    },
  );

  it('rejects non-ASCII and line terminators', () => {
    expect(() => parser.parse(Buffer.from([0xff, ...Buffer.from(',0,0,0,0,T')]))).toThrow();
    expect(() => parser.parse(Buffer.from('9.7,0,0,0,0,T\n'))).toThrow();
  });
});

describe('BPT216CoordinateConverter', () => {
  it('converts 0.01 mm units without changing Cartesian signs', () => {
    expect(new BPT216CoordinateConverter().toImpactPoint(123, -456)).toMatchObject({ x: 1.23, y: -4.56 });
  });
});
