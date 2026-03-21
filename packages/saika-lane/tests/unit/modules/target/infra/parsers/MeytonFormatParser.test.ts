// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { MeytonFormatParser } from '@/main/modules/target/infra/parsers/MeytonFormatParser';

describe('MeytonFormatParser', () => {
  const parser = new MeytonFormatParser();
  const manufacturer = TargetManufacturer.meyton();

  it('should parse JSON lines', () => {
    const json = JSON.stringify({ x: 12.5, y: -8.3 });
    const buffer = Buffer.from(json + '\n');

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
    expect(results[0]!.raw.toString()).toBe(json);
    expect(remaining.toString()).toBe('');
  });

  it('should process multiple JSON lines', () => {
    const json1 = JSON.stringify({ x: 12.5, y: -8.3 });
    const json2 = JSON.stringify({ x: 5.0, y: 10.2 });
    const buffer = Buffer.from(json1 + '\n' + json2 + '\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(2);
  });

  it('should skip invalid JSON', () => {
    const buffer = Buffer.from('{ invalid json }\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
  });

  it('should return incomplete lines in remaining', () => {
    const buffer = Buffer.from('{"x": 12.5,');

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining.toString()).toBe('{"x": 12.5,');
  });

  it('should skip empty lines', () => {
    const json = JSON.stringify({ x: 1 });
    const buffer = Buffer.from('\n' + json + '\n\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
  });

  it('should have frozen RawData', () => {
    const json = JSON.stringify({ x: 1 });
    const buffer = Buffer.from(json + '\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(Object.isFrozen(results[0])).toBe(true);
  });
});
