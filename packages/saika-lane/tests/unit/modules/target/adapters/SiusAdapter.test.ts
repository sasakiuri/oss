// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { SiusAdapter } from '@/main/modules/target/adapters/SiusAdapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { DomainError } from '@/shared/errors/DomainError';

describe('SiusAdapter', () => {
  it('should create an instance', () => {
    const adapter = new SiusAdapter();
    expect(adapter).toBeInstanceOf(SiusAdapter);
  });

  it('should have a convert method (ITargetAdapter compliant)', () => {
    const adapter = new SiusAdapter();
    expect(typeof adapter.convert).toBe('function');
  });

  it('should throw DATA_CONVERSION_ERROR from convert() (unimplemented stub)', () => {
    const adapter = new SiusAdapter();
    const rawData: RawData = {
      raw: Buffer.from([0x10, 0x00, 0x20, 0x00]),
      timestamp: new Date(),
      manufacturer: TargetManufacturer.sius(),
    };

    try {
      adapter.convert(rawData);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      expect((error as DomainError).metadata).toMatchObject({
        manufacturer: 'SIUS',
      });
    }
  });
});
