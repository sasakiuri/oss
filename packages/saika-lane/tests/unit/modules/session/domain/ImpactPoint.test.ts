// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { DomainError } from '@/shared/errors/DomainError';

describe('ImpactPoint', () => {
  describe('constructor', () => {
    it('creates an instance with valid values', () => {
      const point = new ImpactPoint(10.5, -20.3);
      expect(point.x).toBe(10.5);
      expect(point.y).toBe(-20.3);
    });

    it('creates an instance at the center point (0,0)', () => {
      const point = new ImpactPoint(0, 0);
      expect(point.x).toBe(0);
      expect(point.y).toBe(0);
    });

    it('creates an instance at boundary values (±1000mm)', () => {
      const point1 = new ImpactPoint(1000, 1000);
      expect(point1.x).toBe(1000);
      expect(point1.y).toBe(1000);

      const point2 = new ImpactPoint(-1000, -1000);
      expect(point2.x).toBe(-1000);
      expect(point2.y).toBe(-1000);
    });

    it('throws an error when x coordinate is NaN', () => {
      try {
        new ImpactPoint(NaN, 10);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when y coordinate is NaN', () => {
      try {
        new ImpactPoint(10, NaN);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when x coordinate is Infinity', () => {
      try {
        new ImpactPoint(Infinity, 10);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when y coordinate is Infinity', () => {
      try {
        new ImpactPoint(10, Infinity);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when x coordinate is -Infinity', () => {
      try {
        new ImpactPoint(-Infinity, 10);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when y coordinate is -Infinity', () => {
      try {
        new ImpactPoint(10, -Infinity);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when x coordinate exceeds 1000mm', () => {
      try {
        new ImpactPoint(1000.1, 0);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when x coordinate is below -1000mm', () => {
      try {
        new ImpactPoint(-1000.1, 0);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when y coordinate exceeds 1000mm', () => {
      try {
        new ImpactPoint(0, 1000.1);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });

    it('throws an error when y coordinate is below -1000mm', () => {
      try {
        new ImpactPoint(0, -1000.1);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_IMPACT_POINT');
      }
    });
  });

  describe('distanceFromCenter()', () => {
    it('calculates the distance from center accurately', () => {
      const point = new ImpactPoint(3, 4);
      expect(point.distanceFromCenter()).toBe(5); // 3-4-5 right triangle
    });

    it('distance at center point is 0', () => {
      const point = new ImpactPoint(0, 0);
      expect(point.distanceFromCenter()).toBe(0);
    });

    it('calculates distance correctly with negative coordinates', () => {
      const point = new ImpactPoint(-3, -4);
      expect(point.distanceFromCenter()).toBe(5);
    });

    it('calculates distance correctly with decimal coordinates', () => {
      const point = new ImpactPoint(1.5, 2.0);
      expect(point.distanceFromCenter()).toBeCloseTo(2.5, 5);
    });

    it('calculates distance accurately for a point on the X axis', () => {
      const point = new ImpactPoint(10, 0);
      expect(point.distanceFromCenter()).toBe(10);
    });

    it('calculates distance accurately for a point on the Y axis', () => {
      const point = new ImpactPoint(0, 10);
      expect(point.distanceFromCenter()).toBe(10);
    });
  });

  describe('equals()', () => {
    it('returns true for ImpactPoints with the same coordinates', () => {
      const point1 = new ImpactPoint(10, 20);
      const point2 = new ImpactPoint(10, 20);
      expect(point1.equals(point2)).toBe(true);
    });

    it('returns false when x coordinates differ', () => {
      const point1 = new ImpactPoint(10, 20);
      const point2 = new ImpactPoint(11, 20);
      expect(point1.equals(point2)).toBe(false);
    });

    it('returns false when y coordinates differ', () => {
      const point1 = new ImpactPoint(10, 20);
      const point2 = new ImpactPoint(10, 21);
      expect(point1.equals(point2)).toBe(false);
    });

    it('returns false when both coordinates differ', () => {
      const point1 = new ImpactPoint(10, 20);
      const point2 = new ImpactPoint(11, 21);
      expect(point1.equals(point2)).toBe(false);
    });

    it('returns true when compared with itself', () => {
      const point = new ImpactPoint(10, 20);
      expect(point.equals(point)).toBe(true);
    });

    it('returns true when comparing two center points', () => {
      const point1 = new ImpactPoint(0, 0);
      const point2 = new ImpactPoint(0, 0);
      expect(point1.equals(point2)).toBe(true);
    });

    it('compares correctly with negative coordinates', () => {
      const point1 = new ImpactPoint(-10, -20);
      const point2 = new ImpactPoint(-10, -20);
      expect(point1.equals(point2)).toBe(true);
    });
  });

  describe('immutability', () => {
    it('properties are read-only', () => {
      const point = new ImpactPoint(10, 20);
      // TypeScript's type system would cause a compile error for the following:
      // point.x = 30;
      // point.y = 40;

      // Attempting to mutate at runtime has no effect (throws in strict mode)
      expect(() => {
        (point as any).x = 30;
      }).toThrow();
    });
  });
});
