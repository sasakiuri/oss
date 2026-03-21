// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { SiusFormatParser } from '@/main/modules/target/infra/parsers/SiusFormatParser';

describe('SiusFormatParser', () => {
  const parser = new SiusFormatParser();
  const manufacturer = TargetManufacturer.sius();

  it('should parse a 32-byte message', () => {
    const buffer = Buffer.alloc(32);
    buffer.writeInt16LE(125, 0);
    buffer.writeInt16LE(-83, 2);

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
    expect(results[0]!.raw).toHaveLength(32);
    expect(remaining).toHaveLength(0);
  });

  it('should process multiple 32-byte messages', () => {
    const buffer = Buffer.alloc(64);
    buffer.writeInt16LE(125, 0);
    buffer.writeInt16LE(50, 32);

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it('should return incomplete messages in remaining', () => {
    const buffer = Buffer.alloc(48);

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
    expect(remaining).toHaveLength(16);
  });

  it('should return no results and put in remaining for less than 32 bytes', () => {
    const buffer = Buffer.alloc(16);

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining).toHaveLength(16);
  });

  it('should have raw as a copy of the original buffer', () => {
    const buffer = Buffer.alloc(32);
    buffer.writeInt16LE(125, 0);

    const { results } = parser.parse(buffer, manufacturer);

    // Copy so original buffer changes do not affect it
    buffer.writeInt16LE(999, 0);
    expect(results[0]!.raw.readInt16LE(0)).toBe(125);
  });

  it('should have frozen RawData', () => {
    const buffer = Buffer.alloc(32);
    const { results } = parser.parse(buffer, manufacturer);

    expect(Object.isFrozen(results[0])).toBe(true);
  });
});
