// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { RedDotFrameDecodeError, RedDotFrameDecoder } from '@/main/modules/target/adapters/disag/RedDotFrameDecoder';

import {
  recalculateRedDotBcc,
  replaceRedDotAscii,
  signedRedDotFrame,
  validRedDotFrame,
} from '../../../../../helpers/redDotFixtures';

describe('RedDotFrameDecoder', () => {
  const decoder = new RedDotFrameDecoder();

  it('decodes score, distance, and signed coordinates from the synthetic frame', () => {
    const parsed = decoder.decode(validRedDotFrame());

    expect(parsed).toMatchObject({
      discipline: 'LG',
      scoreTenths: 90,
      distanceRaw: 500,
      distanceMm: 5,
      xRaw: 300,
      yRaw: 400,
      xMm: 3,
      yMm: 4,
    });
  });

  it('decodes a two-digit score and negative Y coordinate', () => {
    const parsed = decoder.decode(signedRedDotFrame());

    expect(parsed.scoreTenths).toBe(101);
    expect(parsed.xMm).toBe(1);
    expect(parsed.yMm).toBe(-2);
    expect(parsed.distanceMm).toBeCloseTo(2.236, 6);
  });

  it.each([
    ['STX', 0],
    ['CR1', 9],
    ['CR2', 18],
    ['CR3', 21],
    ['CR4', 24],
    ['CR5', 28],
    ['CR6', 31],
    ['CR7', 36],
    ['CR8', 43],
    ['CR9', 49],
    ['CR10', 55],
    ['ETB', 56],
    ['terminator', 58],
  ])('rejects a damaged %s control byte', (_name, offset) => {
    const frame = validRedDotFrame();
    frame[offset] = frame[offset]! ^ 0x01;

    expect(() => decoder.decode(frame)).toThrow(RedDotFrameDecodeError);
  });

  it('rejects an incorrect BCC', () => {
    const frame = validRedDotFrame();
    frame[57] = frame[57]! ^ 0x01;

    expectDecodeError(frame, 'INVALID_BCC');
  });

  it.each([
    ['discipline', 19, 'LP', 'INVALID_DISCIPLINE'],
    ['score', 32, '9.00', 'INVALID_SCORE'],
    ['distance', 37, '500.00', 'INVALID_DISTANCE'],
    ['X', 44, '00300', 'INVALID_X'],
    ['Y', 50, '0400+', 'INVALID_Y'],
  ])('rejects an invalid %s field', (_name, offset, value, code) => {
    expectDecodeError(replaceRedDotAscii(validRedDotFrame(), offset, value), code);
  });

  it('accepts arbitrary printable reserved fields', () => {
    let frame = replaceRedDotAscii(validRedDotFrame(), 1, 'ABCDEFGH');
    frame = replaceRedDotAscii(frame, 10, '1234wxyz');
    frame = replaceRedDotAscii(frame, 22, 'Z!');

    expect(decoder.decode(frame).reserved.slice(0, 3)).toEqual(['ABCDEFGH', '1234wxyz', 'Z!']);
  });

  it('rejects a non-printable reserved byte even with a matching BCC', () => {
    const frame = validRedDotFrame();
    frame[1] = 0x1f;

    expectDecodeError(recalculateRedDotBcc(frame), 'INVALID_RESERVED_ASCII');
  });

  function expectDecodeError(frame: Buffer, code: string): void {
    try {
      decoder.decode(frame);
      expect.fail('Expected frame decoding to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(RedDotFrameDecodeError);
      expect((error as RedDotFrameDecodeError).code).toBe(code);
    }
  }
});
