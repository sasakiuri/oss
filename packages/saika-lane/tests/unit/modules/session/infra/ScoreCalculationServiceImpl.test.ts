// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { ScoreCalculationServiceImpl } from '@/main/modules/session/infra/ScoreCalculationServiceImpl';

describe('ScoreCalculationServiceImpl', () => {
  describe('instance creation', () => {
    it('can create a ScoreCalculationServiceImpl instance', () => {
      const service = new ScoreCalculationServiceImpl();
      expect(service).toBeDefined();
    });
  });

  describe('calculateScore() - 10m air rifle', () => {
    it('can calculate 10.9 points from center (0, 0)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0, 0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(109);
      expect(score.isInner()).toBe(true);
    });

    it('can calculate 10.9 points from within inner ten range (0.24mm)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0.24, 0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(109);
    });

    it('can calculate 10.0–10.8 points from an impact point in the 10-ring', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(1.5, 0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBeGreaterThanOrEqual(100);
      expect(score.value).toBeLessThan(109);
    });

    it('can calculate 9.0–9.9 points from an impact point in the 9-ring', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(3.5, 0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBeGreaterThanOrEqual(90);
      expect(score.value).toBeLessThan(100);
    });

    it('can calculate 0.0 points from an impact point outside the target', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(100, 0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(0);
    });

    it('can calculate score correctly even with negative coordinates', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint1 = new ImpactPoint(1.5, 0);
      const impactPoint2 = new ImpactPoint(-1.5, 0);
      const discipline = Discipline.airRifle10m();

      const score1 = service.calculateScore(impactPoint1, discipline);
      const score2 = service.calculateScore(impactPoint2, discipline);

      expect(score1.equals(score2)).toBe(true);
    });

    it('can calculate score correctly even for diagonal impact points', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(1.0, 1.0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBeGreaterThanOrEqual(90);
      expect(score.value).toBeLessThanOrEqual(109);
    });
  });

  describe('calculateScore() - 10m air pistol', () => {
    it('can calculate 10.9 points from center (0, 0)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0, 0);
      const discipline = Discipline.airPistol10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(109);
      expect(score.isInner()).toBe(true);
    });

    it('can calculate 10.0–10.8 points from an impact point in the 10-ring', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(6.0, 0);
      const discipline = Discipline.airPistol10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBeGreaterThanOrEqual(100);
      expect(score.value).toBeLessThan(109);
    });

    it('can calculate 0.0 points from an impact point outside the target', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(200, 0);
      const discipline = Discipline.airPistol10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(0);
    });

    it('score at 5.0mm differs between AP and AR', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(5.0, 0);
      const apDiscipline = Discipline.airPistol10m();
      const arDiscipline = Discipline.airRifle10m();

      const apScore = service.calculateScore(impactPoint, apDiscipline);
      const arScore = service.calculateScore(impactPoint, arDiscipline);

      // AP: 10.3 points (within 10.3-ring boundary at 5.60mm)
      expect(apScore.value).toBe(103);
      // AR: 9.0 points (9.0-ring boundary at 5.00mm)
      expect(arScore.value).toBe(90);
      // AP score is higher
      expect(apScore.value).toBeGreaterThan(arScore.value);
    });

    it('impact at 80.00mm is AP 1.0 point', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(80.0, 0);
      const discipline = Discipline.airPistol10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(10);
    });

    it('impact at 80.01mm is AP miss (0.0 points)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(80.01, 0);
      const discipline = Discipline.airPistol10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(0);
    });
  });

  describe('calculateScore() - 50m rifle', () => {
    it('can calculate 10.9 points from center (0, 0)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0, 0);
      const discipline = Discipline.rifle50m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(109);
      expect(score.isInner()).toBe(true);
    });

    it('can calculate 10.9 points from within inner ten range (0.79mm)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0.79, 0);
      const discipline = Discipline.rifle50m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(109);
    });

    it('can calculate 10.0–10.8 points from an impact point in the 10-ring', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(6.0, 0);
      const discipline = Discipline.rifle50m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBeGreaterThanOrEqual(100);
      expect(score.value).toBeLessThan(109);
    });

    it('can calculate 0.0 points from an impact point outside the target', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(100, 0);
      const discipline = Discipline.rifle50m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(0);
    });
  });

  describe('calculateScore() - 25m pistol', () => {
    it('can calculate 10 points from center (0, 0)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0, 0);
      const discipline = Discipline.pistol25m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(100);
      expect(score.isInner()).toBe(false);
    });

    it('should calculate 10 points from within inner-ten range (24mm)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(24, 0);
      const discipline = Discipline.pistol25m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(100);
    });

    it('should calculate 10.0 points from an impact in the 10-ring', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(40, 0);
      const discipline = Discipline.pistol25m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(100);
    });

    it('should calculate 0.0 points from an impact outside the target', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(500, 0);
      const discipline = Discipline.pistol25m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(0);
    });
  });

  describe('getTargetDesign() - without caching', () => {
    it('should retrieve the 10m air rifle target design', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();

      const targetDesign = service.getTargetDesign(discipline);

      expect(targetDesign).toBeDefined();
      expect(targetDesign.discipline.equals(discipline)).toBe(true);
      expect(targetDesign.rings.length).toBeGreaterThanOrEqual(10);
    });

    it('should retrieve the 10m air pistol target design', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airPistol10m();

      const targetDesign = service.getTargetDesign(discipline);

      expect(targetDesign).toBeDefined();
      expect(targetDesign.discipline.equals(discipline)).toBe(true);
    });

    it('should retrieve the 50m rifle target design', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.rifle50m();

      const targetDesign = service.getTargetDesign(discipline);

      expect(targetDesign).toBeDefined();
      expect(targetDesign.discipline.equals(discipline)).toBe(true);
    });

    it('should retrieve the 25m pistol target design', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.pistol25m();

      const targetDesign = service.getTargetDesign(discipline);

      expect(targetDesign).toBeDefined();
      expect(targetDesign.discipline.equals(discipline)).toBe(true);
    });
  });

  describe('getTargetDesign() - caching behavior', () => {
    it('should return the same instance when called twice with the same discipline (cache hit)', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();

      const targetDesign1 = service.getTargetDesign(discipline);
      const targetDesign2 = service.getTargetDesign(discipline);

      // Same instance (cache is working)
      expect(targetDesign1).toBe(targetDesign2);
    });

    it('should return different instances for different disciplines', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline1 = Discipline.airRifle10m();
      const discipline2 = Discipline.airPistol10m();

      const targetDesign1 = service.getTargetDesign(discipline1);
      const targetDesign2 = service.getTargetDesign(discipline2);

      // Different instances
      expect(targetDesign1).not.toBe(targetDesign2);
    });

    it('should cache across different Discipline instances of the same discipline', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline1 = Discipline.airRifle10m();
      const discipline2 = Discipline.airRifle10m();

      const targetDesign1 = service.getTargetDesign(discipline1);
      const targetDesign2 = service.getTargetDesign(discipline2);

      // Same instance (cache hit when discipline value matches)
      expect(targetDesign1).toBe(targetDesign2);
    });

    it('should have independent caching for all disciplines', () => {
      const service = new ScoreCalculationServiceImpl();
      const disciplines = [
        Discipline.airRifle10m(),
        Discipline.airPistol10m(),
        Discipline.rifle50m(),
        Discipline.pistol25m(),
      ];

      const designs1 = disciplines.map((d) => service.getTargetDesign(d));
      const designs2 = disciplines.map((d) => service.getTargetDesign(d));

      // Cache is working for each discipline
      for (let i = 0; i < disciplines.length; i++) {
        expect(designs1[i]).toBe(designs2[i]);
      }

      // Designs for each discipline are different
      for (let i = 0; i < designs1.length; i++) {
        for (let j = i + 1; j < designs1.length; j++) {
          expect(designs1[i]).not.toBe(designs1[j]);
        }
      }
    });
  });

  describe('Edge cases', () => {
    it('should score 0.0 for an extremely distant impact (999mm)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(999, 0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(0);
    });

    it('should score 0.0 for an impact at (-999, -999)', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(-999, -999);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(0);
    });

    it('should score the maximum for an impact at origin (0, 0) for all disciplines', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0, 0);
      const expected: [ReturnType<typeof Discipline.airRifle10m>, number][] = [
        [Discipline.airRifle10m(), 109],
        [Discipline.airPistol10m(), 109],
        [Discipline.rifle50m(), 109],
        [Discipline.pistol25m(), 100],
      ];

      for (const [discipline, expectedScore] of expected) {
        const score = service.calculateScore(impactPoint, discipline);
        expect(score.value).toBe(expectedScore);
      }
    });
  });

  describe('Boundary value tests', () => {
    it('should score high just inside the ring boundary (10m air rifle)', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();
      const targetDesign = service.getTargetDesign(discipline);
      const firstRing = targetDesign.rings[0];

      expect(firstRing).toBeDefined();
      const innerTenRadius = firstRing!.radius;
      const impactPoint = new ImpactPoint(innerTenRadius - 0.01, 0);

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(109);
    });

    it('should score lower just outside the ring boundary (10m air rifle)', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();
      const targetDesign = service.getTargetDesign(discipline);
      const firstRing = targetDesign.rings[0];

      expect(firstRing).toBeDefined();
      const innerTenRadius = firstRing!.radius;
      const impactPoint = new ImpactPoint(innerTenRadius + 0.01, 0);

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBeLessThan(109);
    });
  });

  describe('Precision tests', () => {
    it('should calculate score with precision to one decimal place', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(1.5, 0);
      const discipline = Discipline.airRifle10m();

      const score = service.calculateScore(impactPoint, discipline);

      // Score is precise to one decimal (e.g., 10.5, 9.8)
      expect(Number.isInteger(score.value)).toBe(true);
    });

    it('should give the same score for concentric impacts', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();

      // 4 points on a concentric circle (radius 1.0mm)
      const points = [
        new ImpactPoint(1.0, 0),
        new ImpactPoint(0, 1.0),
        new ImpactPoint(-1.0, 0),
        new ImpactPoint(0, -1.0),
      ];

      const scores = points.map((point) => service.calculateScore(point, discipline));

      // All should have the same score
      const firstScore = scores[0];
      expect(firstScore).toBeDefined();
      for (let i = 1; i < scores.length; i++) {
        const currentScore = scores[i];
        expect(currentScore).toBeDefined();
        expect(currentScore!.equals(firstScore!)).toBe(true);
      }
    });
  });

  describe('Sequential call tests', () => {
    it('should work correctly with sequential calculateScore calls', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();

      const impactPoints = [
        new ImpactPoint(0, 0), // 10.9 points
        new ImpactPoint(1.5, 0), // 10.x points
        new ImpactPoint(3.5, 0), // 9.x points
        new ImpactPoint(100, 0), // 0.0 points
      ];

      const scores = impactPoints.map((point) => service.calculateScore(point, discipline));

      expect(scores[0]?.value).toBe(109);
      expect(scores[1]?.value).toBeGreaterThanOrEqual(100);
      expect(scores[2]?.value).toBeGreaterThanOrEqual(90);
      expect(scores[3]?.value).toBe(0);
    });

    it('should work correctly with sequential calls for different disciplines', () => {
      const service = new ScoreCalculationServiceImpl();
      const impactPoint = new ImpactPoint(0, 0);

      const expected: [ReturnType<typeof Discipline.airRifle10m>, number][] = [
        [Discipline.airRifle10m(), 109],
        [Discipline.airPistol10m(), 109],
        [Discipline.rifle50m(), 109],
        [Discipline.pistol25m(), 100],
      ];

      for (const [discipline, expectedScore] of expected) {
        const score = service.calculateScore(impactPoint, discipline);
        expect(score.value).toBe(expectedScore);
      }
    });
  });

  describe('Performance tests', () => {
    it('should work correctly with a large number of calculations (1000 times)', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();

      for (let i = 0; i < 1000; i++) {
        const x = Math.random() * 10 - 5; // -5 to 5mm
        const y = Math.random() * 10 - 5;
        const impactPoint = new ImpactPoint(x, y);

        const score = service.calculateScore(impactPoint, discipline);

        // Score is in the range of 0.0 to 10.9
        expect(score.value).toBeGreaterThanOrEqual(0);
        expect(score.value).toBeLessThanOrEqual(109);
      }
    });

    it('should be fast for getTargetDesign calls (cache effect)', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();

      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        service.getTargetDesign(discipline);
      }
      const endTime = performance.now();

      // 1000 calls should be within 10ms (cache is working)
      expect(endTime - startTime).toBeLessThan(10);
    });
  });

  describe('Outer-edge scoring (shotRadius built into ring definitions)', () => {
    it('AIR_RIFLE: shotRadius=2.25 is built into ring definitions', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airRifle10m();
      // 10-ring inner edge radius = 0.25mm, shotRadius = 2.25mm
      // 10.9 ring judgment radius = 0.25mm (0 + 1 * 0.25)
      // 10.0 ring judgment radius = 2.50mm (0 + 10 * 0.25)
      const impactPoint = new ImpactPoint(2.5, 0);

      const score = service.calculateScore(impactPoint, discipline);

      // distance=2.50 <= 2.50 (10.0 ring boundary) -> 10.0 points
      expect(score.value).toBe(100);
    });

    it('BEAM_RIFLE: shotRadius=3.0 is built into ring definitions', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.beamRifle10m();
      // 10.9 ring judgment radius = 0.35mm
      // 10.0 ring judgment radius = 3.50mm
      const impactPoint = new ImpactPoint(3.5, 0);

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(100);
    });

    it('AIR_PISTOL: shotRadius=2.25 is built into ring definitions', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.airPistol10m();
      // 10.9 ring judgment radius = 0.80mm
      // 10.0 ring judgment radius = 8.00mm
      const impactPoint = new ImpactPoint(8.0, 0);

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(100);
    });

    it('MT201 sample data: 10.7 points at 0.88mm distance', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.beamRifle10m();
      const impactPoint = new ImpactPoint(0.88, 0);

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(107);
    });

    it('MT201 sample data: 10.5 points at 1.44mm distance', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.beamRifle10m();
      const impactPoint = new ImpactPoint(1.44, 0);

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(105);
    });

    it('MT201 sample data: 9.7 points at 4.09mm distance', () => {
      const service = new ScoreCalculationServiceImpl();
      const discipline = Discipline.beamRifle10m();
      const impactPoint = new ImpactPoint(4.09, 0);

      const score = service.calculateScore(impactPoint, discipline);

      expect(score.value).toBe(97);
    });
  });
});
