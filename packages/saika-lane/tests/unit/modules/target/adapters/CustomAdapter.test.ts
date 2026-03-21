// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { CustomAdapter } from '@/main/modules/target/adapters/CustomAdapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { DomainError } from '@/shared/errors/DomainError';

const defaultContext = (): AdapterContext => ({
  shotNumber: 1,
  discipline: Discipline.airRifle10m(),
  mode: Mode.sighting(),
});

describe('CustomAdapter', () => {
  let adapter: CustomAdapter;

  beforeEach(() => {
    adapter = new CustomAdapter();
  });

  describe('convert() - normal cases', () => {
    it('should convert valid CSV data to a Shot object', () => {
      const rawData: RawData = {
        raw: Buffer.from('12.5,-8.3,ABC\n'),
        timestamp: new Date('2024-01-15T10:30:00Z'),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(12.5);
      expect(shot.impactPoint!.y).toBe(-8.3);
      expect(shot.shotNumber).toBe(1);
      expect(shot.timestamp).toEqual(rawData.timestamp);
      expect(shot.mode.value).toBe('SIGHTING');
    });

    it('should correctly convert CSV data for center point (0,0)', () => {
      const rawData: RawData = {
        raw: Buffer.from('0,0,CENTER\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(0);
      expect(shot.impactPoint!.y).toBe(0);
      expect(shot.score.isInner()).toBe(true); // Center point is inner ten (10.9)
      expect(shot.score.value).toBe(109);
    });

    it('should correctly convert CSV data without metadata', () => {
      const rawData: RawData = {
        raw: Buffer.from('5.5,3.2\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(5.5);
      expect(shot.impactPoint!.y).toBe(3.2);
    });

    it('should correctly convert negative coordinate values', () => {
      const rawData: RawData = {
        raw: Buffer.from('-10.5,-20.3,NEG\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(-10.5);
      expect(shot.impactPoint!.y).toBe(-20.3);
    });

    it('should correctly convert integer coordinates', () => {
      const rawData: RawData = {
        raw: Buffer.from('10,20,INT\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(10);
      expect(shot.impactPoint!.y).toBe(20);
    });

    it('should correctly convert coordinates with more than 1 decimal place', () => {
      const rawData: RawData = {
        raw: Buffer.from('12.345,-8.678,DECIMAL\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.impactPoint!.x).toBe(12.345);
      expect(shot.impactPoint!.y).toBe(-8.678);
    });

    it('should reflect context shotNumber in the Shot', () => {
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

      const rawData3: RawData = {
        raw: Buffer.from('3,3,SHOT3\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot1 = adapter.convert(rawData1, { ...defaultContext(), shotNumber: 1 });
      const shot2 = adapter.convert(rawData2, { ...defaultContext(), shotNumber: 2 });
      const shot3 = adapter.convert(rawData3, { ...defaultContext(), shotNumber: 3 });

      expect(shot1.shotNumber).toBe(1);
      expect(shot2.shotNumber).toBe(2);
      expect(shot3.shotNumber).toBe(3);
    });
  });

  describe('convert() - score calculation (10m air rifle)', () => {
    it('should correctly calculate inner ten (10.9)', () => {
      // Distance from center within 0.25mm
      const rawData: RawData = {
        raw: Buffer.from('0.1,0.1,INNER\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.score.value).toBe(109);
      expect(shot.score.isInner()).toBe(true);
    });

    it('should correctly calculate 10.0', () => {
      // Distance from center within 2.5mm
      const rawData: RawData = {
        raw: Buffer.from('2.5,0,TEN\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.score.value).toBe(100);
    });

    it('should correctly calculate 9.0', () => {
      // Distance from center within 5.0mm
      const rawData: RawData = {
        raw: Buffer.from('3,4,NINE\n'), // distance = 5.0mm
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.score.value).toBe(90);
    });

    it('should correctly calculate 1.0', () => {
      // Distance from center within 25.0mm (1.0 boundary)
      const rawData: RawData = {
        raw: Buffer.from('25,0,ONE\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.score.value).toBe(10);
    });

    it('should correctly calculate miss (0.0)', () => {
      // Distance from center greater than 45.0mm
      const rawData: RawData = {
        raw: Buffer.from('50,50,MISS\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      expect(shot.score.value).toBe(0);
    });
  });

  describe('convert() - CSV format errors', () => {
    it('should throw an error when there is only one field', () => {
      const rawData: RawData = {
        raw: Buffer.from('12.5\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should throw an error for empty CSV data', () => {
      const rawData: RawData = {
        raw: Buffer.from(''),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();
    });

    it('should throw an error for CSV data with only a newline', () => {
      const rawData: RawData = {
        raw: Buffer.from('\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      expect(() => adapter.convert(rawData, defaultContext())).toThrow();
    });

    it('should throw VALIDATION_ERROR when X coordinate is not a number', () => {
      const rawData: RawData = {
        raw: Buffer.from('abc,10,DATA\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should throw VALIDATION_ERROR when Y coordinate is not a number', () => {
      const rawData: RawData = {
        raw: Buffer.from('10,xyz,DATA\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should throw VALIDATION_ERROR when X coordinate is Infinity', () => {
      const rawData: RawData = {
        raw: Buffer.from('Infinity,10,DATA\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should throw VALIDATION_ERROR when Y coordinate is NaN', () => {
      const rawData: RawData = {
        raw: Buffer.from('10,NaN,DATA\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

  describe('convert() - coordinate value range errors', () => {
    it('should throw VALIDATION_ERROR when X coordinate exceeds 1000mm', () => {
      const rawData: RawData = {
        raw: Buffer.from('1000.1,0,OUT\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should throw VALIDATION_ERROR when X coordinate is below -1000mm', () => {
      const rawData: RawData = {
        raw: Buffer.from('-1000.1,0,OUT\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should throw VALIDATION_ERROR when Y coordinate exceeds 1000mm', () => {
      const rawData: RawData = {
        raw: Buffer.from('0,1000.1,OUT\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should throw VALIDATION_ERROR when Y coordinate is below -1000mm', () => {
      const rawData: RawData = {
        raw: Buffer.from('0,-1000.1,OUT\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
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

    it('should process boundary values (+/-1000mm) normally', () => {
      const rawData1: RawData = {
        raw: Buffer.from('1000,1000,BOUNDARY\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const rawData2: RawData = {
        raw: Buffer.from('-1000,-1000,BOUNDARY\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      expect(() => adapter.convert(rawData1, defaultContext())).not.toThrow();
      expect(() => adapter.convert(rawData2, defaultContext())).not.toThrow();

      const shot1 = adapter.convert(rawData1, { ...defaultContext(), shotNumber: 1 });
      const shot2 = adapter.convert(rawData2, { ...defaultContext(), shotNumber: 2 });

      expect(shot1.impactPoint!.x).toBe(1000);
      expect(shot1.impactPoint!.y).toBe(1000);
      expect(shot2.impactPoint!.x).toBe(-1000);
      expect(shot2.impactPoint!.y).toBe(-1000);
    });
  });

  describe('context discipline should be reflected in score calculation', () => {
    it('should perform score calculation even when discipline is changed', () => {
      const rawData: RawData = {
        raw: Buffer.from('0,0,TEST\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const ctx = { ...defaultContext(), discipline: Discipline.airPistol10m() };
      const shot = adapter.convert(rawData, ctx);
      // Score calculation is the same even with changed discipline (10m air pistol uses the same ring definition)
      expect(shot.score.value).toBe(109);
    });
  });

  describe('context mode should be reflected in the Shot', () => {
    it('should reflect MATCH mode from context', () => {
      const rawData: RawData = {
        raw: Buffer.from('5,5,TEST\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const ctx = { ...defaultContext(), mode: Mode.match() };
      const shot = adapter.convert(rawData, ctx);

      expect(shot.mode.value).toBe('MATCH');
      expect(shot.mode.isMatch()).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('should produce an immutable Shot object', () => {
      const rawData: RawData = {
        raw: Buffer.from('10,20,TEST\n'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };

      const shot = adapter.convert(rawData, defaultContext());

      // Shot entity is frozen, so attempting to modify it throws an error
      expect(() => {
        (shot as any).shotNumber = 999;
      }).toThrow();
    });
  });
});
