// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { KohtoFormatParser } from '@/main/modules/target/infra/parsers/KohtoFormatParser';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(false),
  }),
}));

describe('KohtoFormatParser', () => {
  const parser = new KohtoFormatParser();
  const manufacturer = TargetManufacturer.kohto();

  it('should parse MT201 data', () => {
    const buffer = Buffer.from('R 9.7 0250 FF5F 70\n');

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
    expect(results[0]!.raw.toString()).toBe('R 9.7 0250 FF5F 70');
    expect(remaining.toString()).toBe('');
  });

  it('should parse multiple lines', () => {
    const buffer = Buffer.from('R 9.7 0250 FF5F 70\nS10.5 00D0 FFC8 71\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(2);
    expect(results[0]!.raw.toString()).toBe('R 9.7 0250 FF5F 70');
    expect(results[1]!.raw.toString()).toBe('S10.5 00D0 FFC8 71');
  });

  it('should return incomplete data in remaining', () => {
    const buffer = Buffer.from('R 9.7 0250');

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining.toString()).toBe('R 9.7 0250');
  });

  it('should skip empty lines', () => {
    const buffer = Buffer.from('R 9.7 0250 FF5F 70\n\n\nS10.5 00D0 FFC8 71\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(2);
  });

  it('should have frozen RawData', () => {
    const buffer = Buffer.from('R 9.7 0250 FF5F 70\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(Object.isFrozen(results[0])).toBe(true);
  });
});
