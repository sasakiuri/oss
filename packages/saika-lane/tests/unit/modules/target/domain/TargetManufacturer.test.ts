// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

describe('TargetManufacturer value object', () => {
  describe('Factory methods', () => {
    it('should create a SIUS manufacturer with TargetManufacturer.sius()', () => {
      const manufacturer = TargetManufacturer.sius();
      expect(manufacturer.value).toBe('SIUS');
      expect(manufacturer.displayName).toBe('SIUS');
    });

    it('should create a Meyton manufacturer with TargetManufacturer.meyton()', () => {
      const manufacturer = TargetManufacturer.meyton();
      expect(manufacturer.value).toBe('MEYTON');
      expect(manufacturer.displayName).toBe('Meyton');
    });

    it('should create a DISAG manufacturer with TargetManufacturer.disag()', () => {
      const manufacturer = TargetManufacturer.disag();
      expect(manufacturer.value).toBe('DISAG');
      expect(manufacturer.displayName).toBe('DISAG');
    });

    it('should create a Custom manufacturer with TargetManufacturer.custom()', () => {
      const manufacturer = TargetManufacturer.custom();
      expect(manufacturer.value).toBe('CUSTOM');
      expect(manufacturer.displayName).toBe('Custom');
    });
  });

  describe('equals() method', () => {
    it('should return true when comparing the same SIUS manufacturers', () => {
      const manufacturer1 = TargetManufacturer.sius();
      const manufacturer2 = TargetManufacturer.sius();
      expect(manufacturer1.equals(manufacturer2)).toBe(true);
    });

    it('should return false when comparing different manufacturers', () => {
      const manufacturer1 = TargetManufacturer.sius();
      const manufacturer2 = TargetManufacturer.meyton();
      expect(manufacturer1.equals(manufacturer2)).toBe(false);
    });

    it('should return true when comparing with itself', () => {
      const manufacturer = TargetManufacturer.sius();
      expect(manufacturer.equals(manufacturer)).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('should have readonly properties', () => {
      const manufacturer = TargetManufacturer.sius();
      expect(() => {
        (manufacturer as any).value = 'MEYTON';
      }).toThrow();
    });
  });
});
