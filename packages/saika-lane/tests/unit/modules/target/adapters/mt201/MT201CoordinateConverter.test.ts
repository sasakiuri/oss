// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { MT201CoordinateConverter } from '@/main/modules/target/adapters/mt201/MT201CoordinateConverter';

describe('MT201CoordinateConverter', () => {
  let converter: MT201CoordinateConverter;

  beforeEach(() => {
    converter = new MT201CoordinateConverter();
  });

  describe('hexToSignedInt16()', () => {
    it('should correctly convert 0x0000 (zero)', () => {
      expect(converter.hexToSignedInt16('0000')).toBe(0);
    });

    it('should correctly convert 0x0001 (+1)', () => {
      expect(converter.hexToSignedInt16('0001')).toBe(1);
    });

    it('should correctly convert 0x0250 (+592)', () => {
      expect(converter.hexToSignedInt16('0250')).toBe(592);
    });

    it('should correctly convert 0x7FFF (max positive: +32767)', () => {
      expect(converter.hexToSignedInt16('7FFF')).toBe(32767);
    });

    it('should correctly convert 0x8000 (min negative: -32768)', () => {
      expect(converter.hexToSignedInt16('8000')).toBe(-32768);
    });

    it('should correctly convert 0x8001 (-32767)', () => {
      expect(converter.hexToSignedInt16('8001')).toBe(-32767);
    });

    it('should correctly convert 0xFF5F (-161)', () => {
      expect(converter.hexToSignedInt16('FF5F')).toBe(-161);
    });

    it('should correctly convert 0xFFFF (-1)', () => {
      expect(converter.hexToSignedInt16('FFFF')).toBe(-1);
    });

    it('should correctly convert 0xFFC8 (-56)', () => {
      expect(converter.hexToSignedInt16('FFC8')).toBe(-56);
    });

    it('should correctly convert 0xF000 (-4096)', () => {
      expect(converter.hexToSignedInt16('F000')).toBe(-4096);
    });

    it('should correctly convert 0xE000 (-8192)', () => {
      expect(converter.hexToSignedInt16('E000')).toBe(-8192);
    });
  });

  describe('rawToMm()', () => {
    it('should correctly convert zero', () => {
      expect(converter.rawToMm(0)).toBe(0);
    });

    it('should correctly convert positive value (592 -> 3.947mm)', () => {
      expect(converter.rawToMm(592)).toBeCloseTo(3.947, 2);
    });

    it('should correctly convert negative value (-161 -> -1.073mm)', () => {
      expect(converter.rawToMm(-161)).toBeCloseTo(-1.073, 2);
    });

    it('should correctly convert max positive (32767 -> 218.447mm)', () => {
      expect(converter.rawToMm(32767)).toBeCloseTo(218.447, 2);
    });

    it('should correctly convert min negative (-32768 -> -218.453mm)', () => {
      expect(converter.rawToMm(-32768)).toBeCloseTo(-218.453, 2);
    });

    it('should correctly convert 1 (0.007mm)', () => {
      expect(converter.rawToMm(1)).toBeCloseTo(0.007, 3);
    });

    it('should correctly convert -1 (-0.007mm)', () => {
      expect(converter.rawToMm(-1)).toBeCloseTo(-0.007, 3);
    });
  });

  describe('toImpactPoint()', () => {
    it('should generate an ImpactPoint from valid coordinate pair', () => {
      // 0x0250 = 592 → 3.947mm, 0xFF5F = -161 → -1.073mm
      const impactPoint = converter.toImpactPoint('0250', 'FF5F');

      expect(impactPoint.x).toBeCloseTo(3.947, 2);
      expect(impactPoint.y).toBeCloseTo(-1.073, 2);
    });

    it('should generate an ImpactPoint from center coordinates (0,0)', () => {
      const impactPoint = converter.toImpactPoint('0000', '0000');

      expect(impactPoint.x).toBe(0);
      expect(impactPoint.y).toBe(0);
    });

    it('should generate an ImpactPoint from negative coordinate pair', () => {
      // 0xF000 = -4096 → -27.307mm, 0xE000 = -8192 → -54.613mm
      const impactPoint = converter.toImpactPoint('F000', 'E000');

      expect(impactPoint.x).toBeCloseTo(-27.307, 2);
      expect(impactPoint.y).toBeCloseTo(-54.613, 2);
    });

    it('should generate an ImpactPoint from near-max positive coordinates', () => {
      // 0x7FFE = 32766 → 218.44mm
      const impactPoint = converter.toImpactPoint('7FFE', '7FFE');

      expect(impactPoint.x).toBeCloseTo(218.44, 2);
      expect(impactPoint.y).toBeCloseTo(218.44, 2);
    });

    it('should generate an ImpactPoint from min negative coordinates', () => {
      // 0x8000 = -32768 → -218.453mm
      const impactPoint = converter.toImpactPoint('8000', '8000');

      expect(impactPoint.x).toBeCloseTo(-218.453, 2);
      expect(impactPoint.y).toBeCloseTo(-218.453, 2);
    });

    it('should generate an ImpactPoint from 0x0001 (+1/150mm) coordinates', () => {
      const impactPoint = converter.toImpactPoint('0001', '0001');

      expect(impactPoint.x).toBeCloseTo(0.007, 3);
      expect(impactPoint.y).toBeCloseTo(0.007, 3);
    });

    it('should generate an ImpactPoint from 0xFFFF (-1/150mm) coordinates', () => {
      const impactPoint = converter.toImpactPoint('FFFF', 'FFFF');

      expect(impactPoint.x).toBeCloseTo(-0.007, 3);
      expect(impactPoint.y).toBeCloseTo(-0.007, 3);
    });
  });
});
