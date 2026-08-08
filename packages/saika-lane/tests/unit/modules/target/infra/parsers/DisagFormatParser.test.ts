// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { DisagFormatParser } from '@/main/modules/target/infra/parsers/DisagFormatParser';

import { validRedDotFrame } from '../../../../../helpers/redDotFixtures';

describe('DisagFormatParser', () => {
  const parser = new DisagFormatParser();
  const manufacturer = TargetManufacturer.disag();

  it('parses one complete 59-byte RedDot frame', () => {
    const frame = validRedDotFrame();
    const { results, remaining } = parser.parse(frame, manufacturer);

    expect(results).toHaveLength(1);
    expect(results[0]!.raw).toEqual(frame);
    expect(results[0]!.manufacturer.equals(manufacturer)).toBe(true);
    expect(results[0]!.timestamp).toBeInstanceOf(Date);
    expect(remaining).toHaveLength(0);
  });

  it('parses multiple complete frames', () => {
    const frame = validRedDotFrame();
    const { results } = parser.parse(Buffer.concat([frame, frame]), manufacturer);

    expect(results).toHaveLength(2);
  });

  it('returns an incomplete binary frame as remaining data', () => {
    const partial = validRedDotFrame().subarray(0, 20);
    const { results, remaining } = parser.parse(partial, manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining).toEqual(partial);
  });

  it('consumes an idle NAK without producing RawData', () => {
    const { results, remaining } = parser.parse(Buffer.from([0x15]), manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it('rejects a complete invalid frame', () => {
    const frame = validRedDotFrame();
    frame[57] = frame[57]! ^ 0x01;

    const { results, remaining } = parser.parse(frame, manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it('returns frozen RawData', () => {
    const { results } = parser.parse(validRedDotFrame(), manufacturer);

    expect(Object.isFrozen(results[0])).toBe(true);
  });
});
