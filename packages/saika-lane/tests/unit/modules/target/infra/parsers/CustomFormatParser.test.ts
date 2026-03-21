// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { CustomFormatParser } from '@/main/modules/target/infra/parsers/CustomFormatParser';

describe('CustomFormatParser', () => {
  const parser = new CustomFormatParser();
  const manufacturer = TargetManufacturer.custom();

  it('should parse a complete CSV line', () => {
    const buffer = Buffer.from('12.5,-8.3,ABC\n');
    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
    expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');
    expect(results[0]!.manufacturer.equals(manufacturer)).toBe(true);
    expect(remaining.toString()).toBe('');
  });

  it('should parse multiple lines', () => {
    const buffer = Buffer.from('12.5,-8.3,ABC\n5.0,10.2,DEF\n');
    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(2);
    expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');
    expect(results[1]!.raw.toString()).toBe('5.0,10.2,DEF');
    expect(remaining.toString()).toBe('');
  });

  it('should return incomplete lines in remaining', () => {
    const buffer = Buffer.from('12.5,-8.3,ABC\n5.0,');
    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
    expect(remaining.toString()).toBe('5.0,');
  });

  it('should skip empty lines', () => {
    const buffer = Buffer.from('\n12.5,-8.3,ABC\n\n');
    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
  });

  it('should skip lines with field count other than 3', () => {
    const buffer = Buffer.from('12.5,-8.3\n');
    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
  });

  it('should return empty results for an empty buffer', () => {
    const buffer = Buffer.from('');
    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining.toString()).toBe('');
  });

  it('should have frozen RawData', () => {
    const buffer = Buffer.from('12.5,-8.3,ABC\n');
    const { results } = parser.parse(buffer, manufacturer);

    expect(Object.isFrozen(results[0])).toBe(true);
  });
});
