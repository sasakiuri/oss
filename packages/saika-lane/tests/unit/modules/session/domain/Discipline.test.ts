// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';

describe('Discipline value object', () => {
  describe('factory methods', () => {
    it('Discipline.airRifle10m() creates 10m air rifle', () => {
      const discipline = Discipline.airRifle10m();
      expect(discipline.value).toBe('AIR_RIFLE_10M');
      expect(discipline.displayName).toBe('10m Air Rifle');
      expect(discipline.distance).toBe(10);
      expect(discipline.targetSize).toBe(170.0);
    });

    it('Discipline.airPistol10m() creates 10m air pistol', () => {
      const discipline = Discipline.airPistol10m();
      expect(discipline.value).toBe('AIR_PISTOL_10M');
      expect(discipline.displayName).toBe('10m Air Pistol');
      expect(discipline.distance).toBe(10);
      expect(discipline.targetSize).toBe(170.0);
    });

    it('Discipline.rifle50m() creates 50m rifle', () => {
      const discipline = Discipline.rifle50m();
      expect(discipline.value).toBe('RIFLE_50M');
      expect(discipline.displayName).toBe('50m Rifle');
      expect(discipline.distance).toBe(50);
      expect(discipline.targetSize).toBe(250.0);
    });

    it('Discipline.pistol25m() creates 25m pistol', () => {
      const discipline = Discipline.pistol25m();
      expect(discipline.value).toBe('PISTOL_25M');
      expect(discipline.displayName).toBe('25m Pistol');
      expect(discipline.distance).toBe(25);
      expect(discipline.targetSize).toBe(500);
    });
  });

  describe('equals() method', () => {
    it('returns true when comparing two identical 10m air rifle disciplines', () => {
      const discipline1 = Discipline.airRifle10m();
      const discipline2 = Discipline.airRifle10m();
      expect(discipline1.equals(discipline2)).toBe(true);
    });

    it('returns false when comparing different disciplines', () => {
      const discipline1 = Discipline.airRifle10m();
      const discipline2 = Discipline.airPistol10m();
      expect(discipline1.equals(discipline2)).toBe(false);
    });

    it('returns true when comparing a discipline with itself', () => {
      const discipline = Discipline.airRifle10m();
      expect(discipline.equals(discipline)).toBe(true);
    });
  });

  describe('properties', () => {
    it('each discipline has the correct shooting distance', () => {
      expect(Discipline.airRifle10m().distance).toBe(10);
      expect(Discipline.airPistol10m().distance).toBe(10);
      expect(Discipline.rifle50m().distance).toBe(50);
      expect(Discipline.pistol25m().distance).toBe(25);
    });

    it('each discipline has the correct target size', () => {
      expect(Discipline.airRifle10m().targetSize).toBe(170.0);
      expect(Discipline.airPistol10m().targetSize).toBe(170.0);
      expect(Discipline.rifle50m().targetSize).toBe(250.0);
      expect(Discipline.pistol25m().targetSize).toBe(500);
    });
  });

  describe('immutability', () => {
    it('properties are read-only', () => {
      const discipline = Discipline.airRifle10m();
      expect(() => {
        (discipline as any).value = 'RIFLE_50M';
      }).toThrow();
    });
  });
});
