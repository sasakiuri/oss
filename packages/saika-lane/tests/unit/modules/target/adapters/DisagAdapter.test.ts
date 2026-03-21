// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { DisagAdapter } from '@/main/modules/target/adapters/DisagAdapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { DomainError } from '@/shared/errors/DomainError';

describe('DisagAdapter', () => {
  it('should create an instance', () => {
    const adapter = new DisagAdapter();
    expect(adapter).toBeInstanceOf(DisagAdapter);
  });

  it('should have a convert method (ITargetAdapter compliant)', () => {
    const adapter = new DisagAdapter();
    expect(typeof adapter.convert).toBe('function');
  });

  it('should throw DATA_CONVERSION_ERROR from convert() (unimplemented stub)', () => {
    const adapter = new DisagAdapter();
    const rawData: RawData = {
      raw: Buffer.from([0x01, 0x02, 0x03, 0x04]),
      timestamp: new Date(),
      manufacturer: TargetManufacturer.disag(),
    };

    try {
      adapter.convert(rawData);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      expect((error as DomainError).metadata).toMatchObject({
        manufacturer: 'DISAG',
      });
    }
  });
});
