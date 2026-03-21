// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { MT201Adapter } from '@/main/modules/target/adapters/MT201Adapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
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
  discipline: Discipline.beamRifle10m(),
  mode: Mode.sighting(),
});

describe('MT201Adapter', () => {
  let adapter: MT201Adapter;

  beforeEach(() => {
    adapter = new MT201Adapter();
  });

  describe('convert() - normal cases', () => {
    it('should convert valid data (mode R) to a Shot object', () => {
      // Sample: R 9.7 0250 FF5F 70
      // X coordinate: 0x0250 = 592 -> 592/150 = 3.947mm
      // Y coordinate: 0xFF5F = -161 -> -161/150 = -1.073mm
      const rawData: RawData = {
        raw: Buffer.from('R 9.7 0250 FF5F 70'),
        timestamp: new Date('2024-01-15T10:30:00Z'),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBeCloseTo(3.947, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(-1.073, 2);
      expect(shot.score.value).toBe(97);
      expect(shot.shotNumber).toBe(1);
      expect(shot.timestamp).toEqual(rawData.timestamp);
      // P0-4: device mode priority - 'R' → MATCH
      expect(shot.mode.value).toBe('MATCH');
    });

    it('should correctly process coordinate conversion (positive values)', () => {
      // Sample: R 10.5 00D0 FFC8 71
      // X coordinate: 0x00D0 = 208 -> 208/150 = 1.387mm
      // Y coordinate: 0xFFC8 = -56 -> -56/150 = -0.373mm
      const rawData: RawData = {
        raw: Buffer.from('R10.5 00D0 FFC8 71'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBeCloseTo(1.387, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(-0.373, 2);
      expect(shot.score.value).toBe(105);
    });

    it('should correctly process coordinate conversion (negative values)', () => {
      // Sample: S 8.5 F000 E000 72
      // X coordinate: 0xF000 = -4096 -> -4096/150 = -27.307mm
      // Y coordinate: 0xE000 = -8192 -> -8192/150 = -54.613mm
      const rawData: RawData = {
        raw: Buffer.from('S 8.5 F000 E000 72'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBeCloseTo(-27.307, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(-54.613, 2);
      expect(shot.score.value).toBe(85);
    });

    it('should correctly convert center point (0,0)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R10.9 0000 0000 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(0);
      expect(shot.impactPoint!.y).toBe(0);
      expect(shot.score.value).toBe(109);
      expect(shot.score.isInner()).toBe(true);
    });

    it('should correctly convert mode S data', () => {
      const rawData: RawData = {
        raw: Buffer.from('S 5.5 0100 0200 71'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBeCloseTo(1.707, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(3.413, 2);
      expect(shot.score.value).toBe(55);
    });

    it('should reflect context shotNumber in the Shot', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.0 0100 0100 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot1 = adapter.convert(rawData, { ...defaultContext(), shotNumber: 1 });
      const shot2 = adapter.convert(rawData, { ...defaultContext(), shotNumber: 2 });
      const shot3 = adapter.convert(rawData, { ...defaultContext(), shotNumber: 3 });

      expect(shot1.shotNumber).toBe(1);
      expect(shot2.shotNumber).toBe(2);
      expect(shot3.shotNumber).toBe(3);
    });
  });

  describe('convert() - miss shot handling', () => {
    it('should correctly handle a miss shot (X=7FFF, Y=7FFF, Score=0.0)', () => {
      // Sample: R 0.0 7FFF 7FFF 73
      const rawData: RawData = {
        raw: Buffer.from('R 0.0 7FFF 7FFF 73'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.score.value).toBe(0);
      expect(shot.impactPoint).toBeNull();
    });

    it('should reflect context shotNumber even for miss shots', () => {
      const rawData1: RawData = {
        raw: Buffer.from('R 9.0 0100 0100 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const rawData2: RawData = {
        raw: Buffer.from('R 0.0 7FFF 7FFF 73'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot1 = adapter.convert(rawData1, { ...defaultContext(), shotNumber: 1 });
      const shot2 = adapter.convert(rawData2, { ...defaultContext(), shotNumber: 2 });

      expect(shot1.shotNumber).toBe(1);
      expect(shot2.shotNumber).toBe(2);
    });
  });

  describe('convert() - HEX conversion (signed 16-bit)', () => {
    it('should correctly convert 0x7FFF (max positive: 32767)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 0.0 7FFF 7FFF 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // 7FFF = 32767 -> detected as miss shot so impactPoint becomes null
      expect(shot.impactPoint).toBeNull();
    });

    it('should correctly convert 0x8000 (min negative: -32768)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 5.0 8000 8000 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // 0x8000 = -32768 → -32768/150 = -218.453mm
      expect(shot.impactPoint!.x).toBeCloseTo(-218.453, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(-218.453, 2);
    });

    it('should correctly convert 0x8001 (-32767)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 5.0 8001 8001 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // 0x8001 = -32767 → -32767/150 = -218.447mm
      expect(shot.impactPoint!.x).toBeCloseTo(-218.447, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(-218.447, 2);
    });

    it('should correctly convert 0xFFFF (-1)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.0 FFFF FFFF 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // 0xFFFF = -1 → -1/150 = -0.007mm
      expect(shot.impactPoint!.x).toBeCloseTo(-0.007, 3);
      expect(shot.impactPoint!.y).toBeCloseTo(-0.007, 3);
    });

    it('should correctly convert 0x0000 (zero)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R10.9 0000 0000 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(0);
      expect(shot.impactPoint!.y).toBe(0);
    });

    it('should correctly convert 0x0001 (+1)', () => {
      const rawData: RawData = {
        raw: Buffer.from('R10.8 0001 0001 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // 0x0001 = 1 → 1/150 = 0.007mm
      expect(shot.impactPoint!.x).toBeCloseTo(0.007, 3);
      expect(shot.impactPoint!.y).toBeCloseTo(0.007, 3);
    });
  });

  describe('convert() - data format errors', () => {
    it('should throw DATA_CONVERSION_ERROR when data length is less than 18 characters', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.7 0250'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      }
    });

    it('should throw DATA_CONVERSION_ERROR for empty data', () => {
      const rawData: RawData = {
        raw: Buffer.from(''),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR when mode is invalid (not R/S)', () => {
      const rawData: RawData = {
        raw: Buffer.from('X 9.7 0250 FF5F 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR when score is not a number', () => {
      const rawData: RawData = {
        raw: Buffer.from('R abc 0250 FF5F 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR when X coordinate HEX format is invalid', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.7 GHIJ FF5F 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR when Y coordinate HEX format is invalid', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.7 0250 WXYZ 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR when checksum HEX format is invalid', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.7 0250 FF5F ZZ'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR when X coordinate HEX has insufficient digits', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.7 025  FF5F 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('convert() - score range errors', () => {
    it('should throw an error when score exceeds 11.0', () => {
      const rawData: RawData = {
        raw: Buffer.from('R11.0 0000 0000 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SCORE');
      }
    });

    it('should throw an error when score is negative', () => {
      const rawData: RawData = {
        raw: Buffer.from('R-1.0 0000 0000 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();

      try {
        adapter.convert(rawData, defaultContext());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SCORE');
      }
    });
  });

  describe('convert() - coordinate range errors', () => {
    it('should throw VALIDATION_ERROR when X coordinate exceeds 1000mm', () => {
      // 1000mm * 150 = 150000 = 0x249F0 -> exceeds 16-bit
      // Within MT201 16-bit range (-32768 to 32767) exceeding 1000mm cannot occur,
      // but verified by ImpactPoint constraints
      const rawData: RawData = {
        raw: Buffer.from('R 0.0 7FFF 7FFF 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      // 7FFF = 32767 -> 32767/150 = 218.4mm (within range)
      // X=7FFF, Y=7FFF, Score=0.0 -> detected as miss shot so impactPoint is null
      const shot = adapter.convert(rawData, defaultContext());
      expect(shot.impactPoint).toBeNull();
    });

    it('should process boundary values (equivalent to +/-1000mm) normally', () => {
      // In actual MT201, due to 16-bit constraint, the limit is about +/-218mm
      const rawData: RawData = {
        raw: Buffer.from('R 5.0 7FFE 7FFE 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // 0x7FFE = 32766 → 32766/150 = 218.44mm
      expect(shot.impactPoint!.x).toBeCloseTo(218.44, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(218.44, 2);
    });
  });

  describe('Device mode priority (P0-4)', () => {
    it("data mode 'R' maps to MATCH (takes priority over context mode)", () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.5 0100 0100 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      // Even if context is SIGHTING, 'R' data becomes MATCH
      const ctx = { ...defaultContext(), mode: Mode.sighting() };
      const shot = adapter.convert(rawData, ctx);

      expect(shot.mode.value).toBe('MATCH');
      expect(shot.mode.isMatch()).toBe(true);
    });

    it("data mode 'S' maps to SIGHTING (takes priority over context mode)", () => {
      const rawData: RawData = {
        raw: Buffer.from('S 9.5 0100 0100 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      // Even if context is MATCH, 'S' data becomes SIGHTING
      const ctx = { ...defaultContext(), mode: Mode.match() };
      const shot = adapter.convert(rawData, ctx);

      expect(shot.mode.value).toBe('SIGHTING');
      expect(shot.mode.isSighting()).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('should produce an immutable Shot object', () => {
      const rawData: RawData = {
        raw: Buffer.from('R 9.5 0100 0100 70'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.kohto(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // Shot entity is frozen, so attempting to modify it throws an error
      expect(() => {
        (shot as any).shotNumber = 999;
      }).toThrow();
    });
  });
});
