// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import type { ITargetAdapter } from '@/main/modules/target/adapters/ITargetAdapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
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

class MockAdapter implements ITargetAdapter {
  convert(rawData: RawData, _context: AdapterContext): Shot {
    return Shot.create({
      impactPoint: new ImpactPoint(1.0, 2.0),
      score: new Score(100),
      mode: Mode.sighting(),
      timestamp: rawData.timestamp,
      shotNumber: 1,
      seriesNumber: 0,
      innerTen: false,
    });
  }
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe('Constructor', () => {
    it('should create an empty registry', () => {
      expect(registry.getAdapterCount()).toBe(0);
    });

    it('should have no manufacturer ID adapters registered', () => {
      expect(registry.hasAdapter(TargetManufacturer.custom().value)).toBe(false);
      expect(registry.hasAdapter(TargetManufacturer.kohto().value)).toBe(false);
    });

    it('should have no device ID adapters registered', () => {
      expect(registry.getAdapterByDeviceId('MT201')).toBeUndefined();
      expect(registry.getAdapterByDeviceId('CUSTOM')).toBeUndefined();
    });
  });

  describe('registerAdapter()', () => {
    it('should register a new adapter', () => {
      const mockAdapter = new MockAdapter();

      registry.registerAdapter(TargetManufacturer.sius().value, mockAdapter);

      expect(registry.hasAdapter(TargetManufacturer.sius().value)).toBe(true);
      expect(registry.getAdapterCount()).toBe(1);
    });

    it('should overwrite an existing adapter', () => {
      const adapter1 = new MockAdapter();
      const adapter2 = new MockAdapter();

      registry.registerAdapter(TargetManufacturer.custom().value, adapter1);
      registry.registerAdapter(TargetManufacturer.custom().value, adapter2);

      expect(registry.getAdapterCount()).toBe(1);
      expect(registry.getAdapter(TargetManufacturer.custom().value)).toBe(adapter2);
    });

    it('should register multiple manufacturer adapters', () => {
      registry.registerAdapter(TargetManufacturer.sius().value, new MockAdapter());
      registry.registerAdapter(TargetManufacturer.meyton().value, new MockAdapter());
      registry.registerAdapter(TargetManufacturer.disag().value, new MockAdapter());

      expect(registry.getAdapterCount()).toBe(3);
    });
  });

  describe('removeAdapter()', () => {
    it('should remove a registered adapter', () => {
      registry.registerAdapter(TargetManufacturer.custom().value, new MockAdapter());

      const result = registry.removeAdapter(TargetManufacturer.custom().value);

      expect(result).toBe(true);
      expect(registry.hasAdapter(TargetManufacturer.custom().value)).toBe(false);
      expect(registry.getAdapterCount()).toBe(0);
    });

    it('should return false when removing an unregistered adapter', () => {
      const result = registry.removeAdapter(TargetManufacturer.sius().value);

      expect(result).toBe(false);
    });
  });

  describe('getAdapter()', () => {
    it('should retrieve a registered adapter', () => {
      const mockAdapter = new MockAdapter();
      registry.registerAdapter(TargetManufacturer.custom().value, mockAdapter);

      const adapter = registry.getAdapter(TargetManufacturer.custom().value);
      expect(adapter).toBe(mockAdapter);
    });

    it('should return undefined for an unregistered manufacturer ID', () => {
      const adapter = registry.getAdapter(TargetManufacturer.sius().value);
      expect(adapter).toBeUndefined();
    });
  });

  describe('getAdapterByDeviceId()', () => {
    it('should retrieve an adapter by registered device ID', () => {
      const mockAdapter = new MockAdapter();
      registry.registerAdapter('KOHTO', mockAdapter);
      registry.assignDeviceAdapter('MT201', 'KOHTO');

      expect(registry.getAdapterByDeviceId('MT201')).toBe(mockAdapter);
    });

    it('should return undefined for an unregistered device ID', () => {
      expect(registry.getAdapterByDeviceId('HS10')).toBeUndefined();
    });
  });

  describe('assignDeviceAdapter()', () => {
    it('should assign a manufacturer adapter to a device ID', () => {
      const mockAdapter = new MockAdapter();
      registry.registerAdapter('TEST_MFR', mockAdapter);

      registry.assignDeviceAdapter('TEST_DEVICE', 'TEST_MFR');

      expect(registry.getAdapterByDeviceId('TEST_DEVICE')).toBe(mockAdapter);
    });

    it('should throw DATA_CONVERSION_ERROR when assigning with an unregistered manufacturer ID', () => {
      try {
        registry.assignDeviceAdapter('TEST_DEVICE', 'NONEXISTENT');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
        expect((error as DomainError).metadata).toMatchObject({
          reason: 'Cannot assign device adapter: manufacturer not registered',
          manufacturerId: 'NONEXISTENT',
          deviceId: 'TEST_DEVICE',
        });
      }
    });

    it('should assign the same adapter to multiple device IDs of the same manufacturer', () => {
      const mockAdapter = new MockAdapter();
      registry.registerAdapter('KOHTO', mockAdapter);

      registry.assignDeviceAdapter('DEVICE_A', 'KOHTO');
      registry.assignDeviceAdapter('DEVICE_B', 'KOHTO');

      expect(registry.getAdapterByDeviceId('DEVICE_A')).toBe(mockAdapter);
      expect(registry.getAdapterByDeviceId('DEVICE_B')).toBe(mockAdapter);
      expect(registry.getAdapterByDeviceId('DEVICE_A')).toBe(registry.getAdapterByDeviceId('DEVICE_B'));
    });

    it('should register a device-specific adapter without replacing the manufacturer fallback', () => {
      const fallbackAdapter = new MockAdapter();
      const deviceAdapter = new MockAdapter();
      registry.registerAdapter('KOHTO', fallbackAdapter);

      registry.registerDeviceAdapter('BPT216', deviceAdapter);

      expect(registry.getAdapter('KOHTO')).toBe(fallbackAdapter);
      expect(registry.getAdapterByDeviceId('BPT216')).toBe(deviceAdapter);
    });
  });

  describe('getRegisteredManufacturerIds()', () => {
    it('should return an empty array for an empty registry', () => {
      expect(registry.getRegisteredManufacturerIds()).toEqual([]);
    });

    it('should return the list of registered manufacturer IDs', () => {
      registry.registerAdapter('CUSTOM', new MockAdapter());
      registry.registerAdapter('KOHTO', new MockAdapter());

      const ids = registry.getRegisteredManufacturerIds();

      expect(ids).toContain('CUSTOM');
      expect(ids).toContain('KOHTO');
      expect(ids).toHaveLength(2);
    });
  });

  describe('getRegisteredDeviceIds()', () => {
    it('should return an empty array for an empty registry', () => {
      expect(registry.getRegisteredDeviceIds()).toEqual([]);
    });

    it('should return the list of registered device IDs', () => {
      registry.registerAdapter('KOHTO', new MockAdapter());
      registry.assignDeviceAdapter('MT201', 'KOHTO');
      registry.assignDeviceAdapter('BPT216', 'KOHTO');

      const ids = registry.getRegisteredDeviceIds();

      expect(ids).toContain('MT201');
      expect(ids).toContain('BPT216');
      expect(ids).toHaveLength(2);
    });
  });

  describe('getAdapterCount()', () => {
    it('should increase count after registration', () => {
      registry.registerAdapter(TargetManufacturer.sius().value, new MockAdapter());
      expect(registry.getAdapterCount()).toBe(1);
    });

    it('should decrease count after removal', () => {
      registry.registerAdapter('A', new MockAdapter());
      registry.registerAdapter('B', new MockAdapter());
      registry.removeAdapter('A');
      expect(registry.getAdapterCount()).toBe(1);
    });

    it('should not change count when re-registering the same manufacturer ID', () => {
      registry.registerAdapter(TargetManufacturer.custom().value, new MockAdapter());
      registry.registerAdapter(TargetManufacturer.custom().value, new MockAdapter());
      expect(registry.getAdapterCount()).toBe(1);
    });
  });
});
