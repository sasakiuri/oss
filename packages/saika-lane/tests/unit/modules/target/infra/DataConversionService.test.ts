// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { CustomAdapter } from '@/main/modules/target/adapters/CustomAdapter';
import type { ITargetAdapter } from '@/main/modules/target/adapters/ITargetAdapter';
import { MT201Adapter } from '@/main/modules/target/adapters/MT201Adapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { DomainError } from '@/shared/errors/DomainError';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

const defaultContext = (): AdapterContext => ({
  shotNumber: 1,
  discipline: Discipline.airRifle10m(),
  mode: Mode.sighting(),
});

/**
 * Mock adapter (for testing)
 * Always returns a Shot with fixed values
 */
class MockAdapter implements ITargetAdapter {
  private callCount = 0;

  convert(rawData: RawData, _context: AdapterContext): Shot {
    this.callCount++;
    return Shot.create({
      impactPoint: new ImpactPoint(1.0, 2.0),
      score: new Score(100),
      mode: Mode.sighting(),
      timestamp: rawData.timestamp,
      shotNumber: this.callCount,
      seriesNumber: 0,
      innerTen: false,
    });
  }

  getCallCount(): number {
    return this.callCount;
  }
}

describe('DataConversionService', () => {
  let registry: AdapterRegistry;
  let service: DataConversionService;

  beforeEach(() => {
    registry = new AdapterRegistry();

    // Register adapters (mirrors target.module.ts)
    const customAdapter = new CustomAdapter();
    const mt201Adapter = new MT201Adapter();
    registry.registerAdapter(TargetManufacturer.custom().value, customAdapter);
    registry.registerAdapter(TargetManufacturer.kohto().value, mt201Adapter);
    registry.assignDeviceAdapter('MT201', TargetManufacturer.kohto().value);
    registry.assignDeviceAdapter('BP216', TargetManufacturer.kohto().value);
    registry.assignDeviceAdapter('CUSTOM', TargetManufacturer.custom().value);

    service = new DataConversionService(registry);
  });

  describe('convert() - normal cases', () => {
    it('should correctly convert CUSTOM format RawData to a Shot', () => {
      const rawData: RawData = {
        raw: Buffer.from('12.5,-8.3,ABC\n'),
        timestamp: new Date('2024-01-15T10:30:00Z'),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = service.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(12.5);
      expect(shot.impactPoint!.y).toBe(-8.3);
      expect(shot.timestamp).toEqual(rawData.timestamp);
    });

    it('should correctly convert across multiple convert() calls', () => {
      const rawData1: RawData = {
        raw: Buffer.from('1,1,SHOT1\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const rawData2: RawData = {
        raw: Buffer.from('2,2,SHOT2\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot1 = service.convert(rawData1, { ...defaultContext(), shotNumber: 1 });
      const shot2 = service.convert(rawData2, { ...defaultContext(), shotNumber: 2 });

      expect(shot1.impactPoint!.x).toBe(1);
      expect(shot1.impactPoint!.y).toBe(1);
      expect(shot2.impactPoint!.x).toBe(2);
      expect(shot2.impactPoint!.y).toBe(2);
    });

    it('should convert using an adapter registered in the registry', () => {
      const mockAdapter = new MockAdapter();
      registry.registerAdapter(TargetManufacturer.sius().value, mockAdapter);

      const rawData: RawData = {
        raw: Buffer.from('dummy'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.sius(),
      };

      const shot = service.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(1.0);
      expect(shot.impactPoint!.y).toBe(2.0);
      expect(mockAdapter.getCallCount()).toBe(1);
    });
  });

  describe('convert() - error cases', () => {
    it('should throw DATA_CONVERSION_ERROR for an unsupported manufacturer', () => {
      const rawData: RawData = {
        raw: Buffer.from('dummy'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.sius(),
      };

      try {
        service.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
        expect((error as DomainError).metadata).toMatchObject({
          reason: 'Unsupported manufacturer',
          manufacturer: 'SIUS',
        });
      }
    });

    it('should re-throw the error when adapter conversion fails', () => {
      const rawData: RawData = {
        raw: Buffer.from('invalid,data\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      try {
        service.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('convertByDeviceId()', () => {
    it('should convert using device ID when deviceId is specified', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.7 0250 FF5F 70'),
        timestamp: new Date('2024-01-15T10:30:00Z'),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = service.convertByDeviceId(rawData, 'MT201', defaultContext());

      expect(shot).toBeDefined();
      expect(shot.score.value).toBe(97);
      expect(shot.impactPoint!.x).toBeCloseTo(3.946, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(-1.073, 2);
    });

    it('should throw DATA_CONVERSION_ERROR for an unknown deviceId', () => {
      const rawData: RawData = {
        raw: Buffer.from('1.1,2.2,TEST\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      try {
        service.convertByDeviceId(rawData, 'UNKNOWN_DEVICE', defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
        expect((error as DomainError).metadata).toMatchObject({
          reason: 'Unknown or unsupported device ID',
          deviceId: 'UNKNOWN_DEVICE',
        });
      }
    });

    it('should convert with BP216 device ID (same as MT201Adapter)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 8.5 0100 0200 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = service.convertByDeviceId(rawData, 'BP216', defaultContext());

      expect(shot).toBeDefined();
      expect(shot.score.value).toBe(85);
      expect(shot.impactPoint!.x).toBeCloseTo(1.706, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(3.413, 2);
    });

    it('should accurately distinguish deviceId differences within the same manufacturer', () => {
      const rawDataMT201: RawData = {
        raw: Buffer.from('R 9.5 0096 012C 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const rawDataBP216: RawData = {
        raw: Buffer.from('R 9.0 01C2 0258 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shotMT201 = service.convertByDeviceId(rawDataMT201, 'MT201', { ...defaultContext(), shotNumber: 1 });
      const shotBP216 = service.convertByDeviceId(rawDataBP216, 'BP216', { ...defaultContext(), shotNumber: 2 });

      expect(shotMT201.impactPoint!.x).toBeCloseTo(1.0, 2);
      expect(shotMT201.impactPoint!.y).toBeCloseTo(2.0, 2);
      expect(shotBP216.impactPoint!.x).toBeCloseTo(3.0, 2);
      expect(shotBP216.impactPoint!.y).toBeCloseTo(4.0, 2);
    });
  });

  describe('Integration tests', () => {
    it('should handle the registry operation -> conversion -> removal workflow', () => {
      // 1. Convert CUSTOM format data
      const customData: RawData = {
        raw: Buffer.from('5.5,3.2,TEST\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot1 = service.convert(customData, defaultContext());
      expect(shot1.impactPoint!.x).toBe(5.5);
      expect(shot1.impactPoint!.y).toBe(3.2);

      // 2. Register a new adapter in the registry
      const mockAdapter = new MockAdapter();
      registry.registerAdapter(TargetManufacturer.sius().value, mockAdapter);

      // 3. Convert data from the new manufacturer
      const siusData: RawData = {
        raw: Buffer.from('dummy'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.sius(),
      };

      const shot2 = service.convert(siusData, defaultContext());
      expect(shot2.impactPoint!.x).toBe(1.0);
      expect(shot2.impactPoint!.y).toBe(2.0);

      // 4. Remove the adapter
      registry.removeAdapter(TargetManufacturer.sius().value);

      // 5. Cannot convert after removal
      try {
        service.convert(siusData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      }
    });
  });
});
