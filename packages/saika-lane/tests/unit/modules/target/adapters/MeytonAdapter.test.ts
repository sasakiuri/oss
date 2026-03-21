// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { MeytonAdapter } from '@/main/modules/target/adapters/MeytonAdapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { DomainError } from '@/shared/errors/DomainError';

describe('MeytonAdapter', () => {
  it('should create an instance', () => {
    const adapter = new MeytonAdapter();
    expect(adapter).toBeInstanceOf(MeytonAdapter);
  });

  it('should have a convert method (ITargetAdapter compliant)', () => {
    const adapter = new MeytonAdapter();
    expect(typeof adapter.convert).toBe('function');
  });

  it('should throw DATA_CONVERSION_ERROR from convert() (unimplemented stub)', () => {
    const adapter = new MeytonAdapter();
    const rawData: RawData = {
      raw: Buffer.from('{"x":12.5,"y":-8.3}'),
      timestamp: new Date(),
      manufacturer: TargetManufacturer.meyton(),
    };

    try {
      adapter.convert(rawData);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      expect((error as DomainError).metadata).toMatchObject({
        manufacturer: 'MEYTON',
      });
    }
  });
});
