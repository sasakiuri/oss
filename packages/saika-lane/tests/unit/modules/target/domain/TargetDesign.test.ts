// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';

describe('TargetDesign value object', () => {
  describe('Target design generation', () => {
    it('should generate a 10m air rifle target design with TargetDesign.forDiscipline()', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      expect(targetDesign.discipline).toBe(discipline);
      expect(targetDesign.rings.length).toBeGreaterThanOrEqual(10);
    });

    it('should generate a 10m air pistol target design with TargetDesign.forDiscipline()', () => {
      const discipline = Discipline.airPistol10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      expect(targetDesign.discipline).toBe(discipline);
      expect(targetDesign.rings.length).toBeGreaterThanOrEqual(10);
    });

    it('should generate a 50m rifle target design with TargetDesign.forDiscipline()', () => {
      const discipline = Discipline.rifle50m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      expect(targetDesign.discipline).toBe(discipline);
      expect(targetDesign.rings.length).toBeGreaterThanOrEqual(10);
    });

    it('should generate a 25m pistol target design with TargetDesign.forDiscipline()', () => {
      const discipline = Discipline.pistol25m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      expect(targetDesign.discipline).toBe(discipline);
      expect(targetDesign.rings.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Ring definition invariants', () => {
    it('should have rings sorted in ascending order by radius', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      for (let i = 1; i < targetDesign.rings.length; i++) {
        const currentRing = targetDesign.rings[i];
        const prevRing = targetDesign.rings[i - 1];
        expect(currentRing).toBeDefined();
        expect(prevRing).toBeDefined();
        expect(currentRing!.radius).toBeGreaterThan(prevRing!.radius);
      }
    });

    it('should have ring scores in descending order (smaller radius = higher score)', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      for (let i = 1; i < targetDesign.rings.length; i++) {
        const currentRing = targetDesign.rings[i];
        const prevRing = targetDesign.rings[i - 1];
        expect(currentRing).toBeDefined();
        expect(prevRing).toBeDefined();
        expect(currentRing!.score).toBeLessThanOrEqual(prevRing!.score);
      }
    });

    it('should have the smallest ring (inner ten) with a score of 10.9', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const firstRing = targetDesign.rings[0];

      expect(firstRing).toBeDefined();
      expect(firstRing?.score).toBe(109);
    });

    it('should have the smallest ring radius greater than 0', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const firstRing = targetDesign.rings[0];

      expect(firstRing).toBeDefined();
      expect(firstRing?.radius).toBeGreaterThan(0);
    });
  });

  describe('Score calculation: calculateScore()', () => {
    it('should score inner ten (10.9) for center (0, 0)', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(0, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBe(109);
      expect(score.isInner()).toBe(true);
    });

    it('should score 10.9 for within inner ten range (0.24mm)', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(0.24, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBe(109);
    });

    it('should score between 10.0 and 10.8 for impacts in the 10-ring zone', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(1.0, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBeGreaterThanOrEqual(10);
      expect(score.value).toBeLessThan(109);
    });

    it('should score between 9.0 and 9.9 for impacts in the 9-ring zone', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(3.0, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBeGreaterThanOrEqual(90);
      expect(score.value).toBeLessThan(100);
    });

    it('should score 0.0 for impacts outside the target', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(100, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBe(0);
    });

    it('should calculate scores correctly for negative coordinates', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint1 = new ImpactPoint(1.0, 0);
      const impactPoint2 = new ImpactPoint(-1.0, 0);

      const score1 = targetDesign.calculateScore(impactPoint1);
      const score2 = targetDesign.calculateScore(impactPoint2);

      expect(score1.equals(score2)).toBe(true);
    });

    it('should calculate scores correctly for diagonal impacts', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint1 = new ImpactPoint(1.0, 0);
      const impactPoint2 = new ImpactPoint(0.707, 0.707); // √2/2 ≈ 1.0

      const score1 = targetDesign.calculateScore(impactPoint1);
      const score2 = targetDesign.calculateScore(impactPoint2);

      // Distances are approximately the same, so scores should be approximately the same
      expect(Math.abs(score1.value - score2.value)).toBeLessThan(2);
    });
  });

  describe('Score calculation at ring boundaries', () => {
    it('should score higher just inside the ring boundary', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const firstRing = targetDesign.rings[0];

      // Just inside the inner ten boundary
      expect(firstRing).toBeDefined();
      const innerTenRadius = firstRing!.radius;
      const impactPoint = new ImpactPoint(innerTenRadius - 0.01, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBe(109);
    });

    it('should score lower just outside the ring boundary', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const firstRing = targetDesign.rings[0];

      // Just outside the inner ten boundary
      expect(firstRing).toBeDefined();
      const innerTenRadius = firstRing!.radius;
      const impactPoint = new ImpactPoint(innerTenRadius + 0.01, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBeLessThan(109);
    });
  });

  describe('equals() method', () => {
    it('should return true for TargetDesigns with the same discipline', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign1 = TargetDesign.forDiscipline(discipline);
      const targetDesign2 = TargetDesign.forDiscipline(discipline);

      expect(targetDesign1.equals(targetDesign2)).toBe(true);
    });

    it('should return false for TargetDesigns with different disciplines', () => {
      const discipline1 = Discipline.airRifle10m();
      const discipline2 = Discipline.airPistol10m();
      const targetDesign1 = TargetDesign.forDiscipline(discipline1);
      const targetDesign2 = TargetDesign.forDiscipline(discipline2);

      expect(targetDesign1.equals(targetDesign2)).toBe(false);
    });
  });

  describe('Immutability', () => {
    it('should have discipline property as readonly', () => {
      const design = TargetDesign.forDiscipline(Discipline.airRifle10m());
      expect(() => {
        (design as any).discipline = null;
      }).toThrow();
    });

    it('should have rings property as readonly', () => {
      const design = TargetDesign.forDiscipline(Discipline.airRifle10m());
      expect(() => {
        (design as any).rings = [];
      }).toThrow();
    });

    it('should fail when directly pushing to the rings array', () => {
      const design = TargetDesign.forDiscipline(Discipline.airRifle10m());
      expect(() => {
        (design.rings as any).push({ score: 0, radius: 1000 });
      }).toThrow();
    });

    it('should fail when modifying ring object properties', () => {
      const design = TargetDesign.forDiscipline(Discipline.airRifle10m());
      const firstRing = design.rings[0];
      expect(() => {
        (firstRing as any).score = 0;
      }).toThrow();
    });

    it('should not affect the original TargetDesign when modifying a copy of the rings array', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const originalLength = targetDesign.rings.length;
      const rings = [...targetDesign.rings]; // copy
      rings.push({ score: 0, radius: 1000, radiusSq: 1000000 });

      expect(targetDesign.rings.length).toBe(originalLength);
    });
  });

  describe('Target size verification per discipline', () => {
    it('should have a target size of 170.0mm for 10m air rifle', () => {
      const discipline = Discipline.airRifle10m();
      TargetDesign.forDiscipline(discipline);

      expect(discipline.targetSize).toBe(170.0);
    });

    it('should have a target size of 170.0mm for 10m air pistol', () => {
      const discipline = Discipline.airPistol10m();
      TargetDesign.forDiscipline(discipline);

      expect(discipline.targetSize).toBe(170.0);
    });

    it('should have a target size of 250.0mm for 50m rifle', () => {
      const discipline = Discipline.rifle50m();
      TargetDesign.forDiscipline(discipline);

      expect(discipline.targetSize).toBe(250.0);
    });

    it('should have a target size of 500mm for 25m pistol', () => {
      const discipline = Discipline.pistol25m();
      TargetDesign.forDiscipline(discipline);

      expect(discipline.targetSize).toBe(500);
    });
  });

  describe('Ring definition boundary value tests', () => {
    it('should have the first ring (inner ten) radius of 0.25mm or less', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const firstRing = targetDesign.rings[0];

      expect(firstRing).toBeDefined();
      expect(firstRing?.radius).toBeLessThanOrEqual(0.25);
    });

    it('should have 10 or more rings', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      expect(targetDesign.rings.length).toBeGreaterThanOrEqual(10);
    });

    it('should have all ring scores between 0.0 and 10.9', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      for (const ring of targetDesign.rings) {
        expect(ring.score).toBeGreaterThanOrEqual(0);
        expect(ring.score).toBeLessThanOrEqual(109);
      }
    });

    it('should have all ring radii as positive values', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      for (const ring of targetDesign.rings) {
        expect(ring.radius).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge cases', () => {
    it('should always score maximum for center (0, 0) impact (10.9 for decimal disciplines, 10 for integer disciplines)', () => {
      const decimalDisciplines = [Discipline.airRifle10m(), Discipline.airPistol10m(), Discipline.rifle50m()];

      for (const discipline of decimalDisciplines) {
        const targetDesign = TargetDesign.forDiscipline(discipline);
        const impactPoint = new ImpactPoint(0, 0);
        const score = targetDesign.calculateScore(impactPoint);

        expect(score.value).toBe(109);
      }

      // PISTOL_25M uses integer scores only (maximum is 10 = 100)
      const pistolDesign = TargetDesign.forDiscipline(Discipline.pistol25m());
      const pistolScore = pistolDesign.calculateScore(new ImpactPoint(0, 0));
      expect(pistolScore.value).toBe(100);
    });

    it('should score 0.0 for extremely far impacts (999mm)', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(999, 0);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBe(0);
    });

    it('should score 0.0 for impact at coordinates (-999, -999)', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(-999, -999);

      const score = targetDesign.calculateScore(impactPoint);

      expect(score.value).toBe(0);
    });
  });

  describe('Score calculation precision tests', () => {
    it('should calculate scores with precision to one decimal place', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);
      const impactPoint = new ImpactPoint(1.0, 0);

      const score = targetDesign.calculateScore(impactPoint);

      // Scores are to one decimal place (e.g., 10.5, 9.8)
      expect(Number.isInteger(score.value)).toBe(true);
    });

    it('should score the same for concentric impacts', () => {
      const discipline = Discipline.airRifle10m();
      const targetDesign = TargetDesign.forDiscipline(discipline);

      // 4 points on a concentric circle (radius 1.0mm)
      const points = [
        new ImpactPoint(1.0, 0),
        new ImpactPoint(0, 1.0),
        new ImpactPoint(-1.0, 0),
        new ImpactPoint(0, -1.0),
      ];

      const scores = points.map((point) => targetDesign.calculateScore(point));

      // All should be the same score
      const firstScore = scores[0];
      expect(firstScore).toBeDefined();
      for (let i = 1; i < scores.length; i++) {
        const currentScore = scores[i];
        expect(currentScore).toBeDefined();
        expect(currentScore!.equals(firstScore!)).toBe(true);
      }
    });
  });

  describe('BEAM_RIFLE_10M (BR60S) discipline-specific tests', () => {
    let targetDesign: TargetDesign;
    let discipline: Discipline;

    beforeEach(() => {
      discipline = Discipline.beamRifle10m();
      targetDesign = TargetDesign.forDiscipline(discipline);
    });

    describe('BR60S ring definition verification', () => {
      it('should have 100 rings', () => {
        expect(targetDesign.rings).toHaveLength(100);
      });

      it('should have a score range from 10.9 to 1.0', () => {
        expect(targetDesign.rings[0]?.score).toBe(109);
        expect(targetDesign.rings[99]?.score).toBe(10);
      });

      it('should have radii sorted in ascending order', () => {
        for (let i = 1; i < targetDesign.rings.length; i++) {
          const currentRing = targetDesign.rings[i];
          const prevRing = targetDesign.rings[i - 1];
          expect(currentRing).toBeDefined();
          expect(prevRing).toBeDefined();
          expect(currentRing!.radius).toBeGreaterThan(prevRing!.radius);
        }
      });

      it('should have a target size of 170.0mm', () => {
        expect(discipline.targetSize).toBe(170.0);
      });
    });

    describe('BR60S score calculation accuracy', () => {
      it('should score inner ten (10.9) for center (0, 0)', () => {
        const impactPoint = new ImpactPoint(0, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(109);
      });

      describe('10-point range (0-3.50mm): 10.9-10.0', () => {
        it('should score 10.9 for 0.0mm', () => {
          const impactPoint = new ImpactPoint(0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(109);
        });

        it('should score 10.9 for 0.34mm (within 10.9 ring)', () => {
          const impactPoint = new ImpactPoint(0.34, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(109);
        });

        it('should score 10.9 for 0.35mm (10.9 ring boundary)', () => {
          const impactPoint = new ImpactPoint(0.35, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(109);
        });

        it('should score 10.0 for 3.50mm (10.0 ring boundary)', () => {
          const impactPoint = new ImpactPoint(3.5, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(100);
        });
      });

      describe('9-point range (3.50mm-6.00mm): 9.9-9.0', () => {
        it('should score 9.9 for 3.75mm', () => {
          const impactPoint = new ImpactPoint(3.75, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(99);
        });

        it('should score in the 9-point range for 4.0mm', () => {
          const impactPoint = new ImpactPoint(4.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(90);
          expect(score.value).toBeLessThan(100);
        });

        it('should score 9.0 for 6.00mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(6.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(90);
        });
      });

      describe('8-point range (6.00mm-8.50mm): 8.9-8.0', () => {
        it('should score 8.9 for 6.25mm', () => {
          const impactPoint = new ImpactPoint(6.25, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(89);
        });

        it('should score in the 8-point range for 7.0mm', () => {
          const impactPoint = new ImpactPoint(7.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(80);
          expect(score.value).toBeLessThan(90);
        });

        it('should score 8.0 for 8.50mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(8.5, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(80);
        });
      });

      describe('7-point range (8.50mm-11.00mm): 7.9-7.0', () => {
        it('should score 7.9 for 8.75mm', () => {
          const impactPoint = new ImpactPoint(8.75, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(79);
        });

        it('should score in the 7-point range for 9.5mm', () => {
          const impactPoint = new ImpactPoint(9.5, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(70);
          expect(score.value).toBeLessThan(80);
        });

        it('should score 7.0 for 11.00mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(11.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(70);
        });
      });

      describe('6-point range (11.00mm-13.50mm): 6.9-6.0', () => {
        it('should score 6.9 for 11.25mm', () => {
          const impactPoint = new ImpactPoint(11.25, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(69);
        });

        it('should score in the 6-point range for 12.0mm', () => {
          const impactPoint = new ImpactPoint(12.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(60);
          expect(score.value).toBeLessThan(70);
        });

        it('should score 6.0 for 13.50mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(13.5, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(60);
        });
      });

      describe('5-point range (13.50mm-16.00mm): 5.9-5.0', () => {
        it('should score 5.9 for 13.75mm', () => {
          const impactPoint = new ImpactPoint(13.75, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(59);
        });

        it('should score in the 5-point range for 15.0mm', () => {
          const impactPoint = new ImpactPoint(15.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(50);
          expect(score.value).toBeLessThan(60);
        });

        it('should score 5.0 for 16.00mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(16.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(50);
        });
      });

      describe('4-point range (16.00mm-18.50mm): 4.9-4.0', () => {
        it('should score 4.9 for 16.25mm', () => {
          const impactPoint = new ImpactPoint(16.25, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(49);
        });

        it('should score in the 4-point range for 17.0mm', () => {
          const impactPoint = new ImpactPoint(17.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(40);
          expect(score.value).toBeLessThan(50);
        });

        it('should score 4.0 for 18.50mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(18.5, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(40);
        });
      });

      describe('3-point range (18.50mm-21.00mm): 3.9-3.0', () => {
        it('should score 3.9 for 18.75mm', () => {
          const impactPoint = new ImpactPoint(18.75, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(39);
        });

        it('should score in the 3-point range for 20.0mm', () => {
          const impactPoint = new ImpactPoint(20.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(30);
          expect(score.value).toBeLessThan(40);
        });

        it('should score 3.0 for 21.00mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(21.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(30);
        });
      });

      describe('2-point range (21.00mm-23.50mm): 2.9-2.0', () => {
        it('should score 2.9 for 21.25mm', () => {
          const impactPoint = new ImpactPoint(21.25, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(29);
        });

        it('should score in the 2-point range for 22.0mm', () => {
          const impactPoint = new ImpactPoint(22.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(20);
          expect(score.value).toBeLessThan(30);
        });

        it('should score 2.0 for 23.50mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(23.5, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(20);
        });
      });

      describe('1-point range (23.50mm-26.00mm): 1.9-1.0', () => {
        it('should score 1.9 for 23.75mm', () => {
          const impactPoint = new ImpactPoint(23.75, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(19);
        });

        it('should score in the 1-point range for 25.0mm', () => {
          const impactPoint = new ImpactPoint(25.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBeGreaterThanOrEqual(10);
          expect(score.value).toBeLessThan(20);
        });

        it('should score 1.0 for 26.00mm (on boundary)', () => {
          const impactPoint = new ImpactPoint(26.0, 0);
          const score = targetDesign.calculateScore(impactPoint);
          expect(score.value).toBe(10);
        });
      });
    });

    describe('BR60S boundary value tests', () => {
      it('should correctly differentiate scores between 3.50mm (10.0 boundary) and 3.51mm', () => {
        const impactPoint1 = new ImpactPoint(3.5, 0);
        const impactPoint2 = new ImpactPoint(3.51, 0);

        const score1 = targetDesign.calculateScore(impactPoint1);
        const score2 = targetDesign.calculateScore(impactPoint2);

        expect(score1.value).toBeGreaterThanOrEqual(100);
        expect(score2.value).toBeLessThan(100);
      });

      it('should correctly differentiate scores between 6.00mm (9.0 boundary) and 6.01mm', () => {
        const impactPoint1 = new ImpactPoint(6.0, 0);
        const impactPoint2 = new ImpactPoint(6.01, 0);

        const score1 = targetDesign.calculateScore(impactPoint1);
        const score2 = targetDesign.calculateScore(impactPoint2);

        expect(score1.value).toBeGreaterThanOrEqual(90);
        expect(score2.value).toBeLessThan(90);
      });

      it('should correctly differentiate scores between 8.50mm (8.0 boundary) and 8.51mm', () => {
        const impactPoint1 = new ImpactPoint(8.5, 0);
        const impactPoint2 = new ImpactPoint(8.51, 0);

        const score1 = targetDesign.calculateScore(impactPoint1);
        const score2 = targetDesign.calculateScore(impactPoint2);

        expect(score1.value).toBeGreaterThanOrEqual(80);
        expect(score2.value).toBeLessThan(80);
      });

      it('should correctly differentiate scores at 26.00mm (boundary between 1.0 and miss)', () => {
        const impactPoint1 = new ImpactPoint(26.0, 0);
        const impactPoint2 = new ImpactPoint(26.01, 0);

        const score1 = targetDesign.calculateScore(impactPoint1);
        const score2 = targetDesign.calculateScore(impactPoint2);

        expect(score1.value).toBeGreaterThanOrEqual(10);
        expect(score2.value).toBe(0);
      });
    });

    describe('BR60S miss determination', () => {
      it('should score 0.0 (miss) for 26.5mm (outside 26.00mm)', () => {
        const impactPoint = new ImpactPoint(26.5, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(0);
      });

      it('should score 0.0 (miss) for 27.0mm', () => {
        const impactPoint = new ImpactPoint(27.0, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(0);
      });

      it('should score 0.0 (miss) for 100mm impact', () => {
        const impactPoint = new ImpactPoint(100, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(0);
      });
    });

    describe('BR60S user-provided table verification (N.0 / N.5, all 17 rows)', () => {
      it.each([
        { distance: 6.0, expected: 90 },
        { distance: 7.25, expected: 85 },
        { distance: 8.5, expected: 80 },
        { distance: 9.75, expected: 75 },
        { distance: 11.0, expected: 70 },
        { distance: 12.25, expected: 65 },
        { distance: 13.5, expected: 60 },
        { distance: 14.75, expected: 55 },
        { distance: 16.0, expected: 50 },
        { distance: 17.25, expected: 45 },
        { distance: 18.5, expected: 40 },
        { distance: 19.75, expected: 35 },
        { distance: 21.0, expected: 30 },
        { distance: 22.25, expected: 25 },
        { distance: 23.5, expected: 20 },
        { distance: 24.75, expected: 15 },
        { distance: 26.0, expected: 10 },
      ])('distance $distance mm should score $expected', ({ distance, expected }) => {
        const impactPoint = new ImpactPoint(distance, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(expected);
      });
    });

    describe('MT201 sample data verification', () => {
      it('should match device score 10.7 for distance 0.88mm', () => {
        const impactPoint = new ImpactPoint(0.88, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(107);
      });

      it('should match device score 10.5 for distance 1.44mm', () => {
        const impactPoint = new ImpactPoint(1.44, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(105);
      });

      it('should match device score 9.7 for distance 4.09mm', () => {
        const impactPoint = new ImpactPoint(4.09, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(97);
      });
    });

    describe('BR60S diagonal impact tests', () => {
      it('should calculate scores correctly for diagonal impacts', () => {
        const impactPoint1 = new ImpactPoint(1.0, 0);
        const impactPoint2 = new ImpactPoint(0.707, 0.707); // √2/2 ≈ 1.0mm

        const score1 = targetDesign.calculateScore(impactPoint1);
        const score2 = targetDesign.calculateScore(impactPoint2);

        // Distances are approximately the same, so scores should be approximately the same
        expect(Math.abs(score1.value - score2.value)).toBeLessThan(2);
      });

      it('should calculate scores correctly for negative coordinates', () => {
        const impactPoint1 = new ImpactPoint(5.0, 0);
        const impactPoint2 = new ImpactPoint(-5.0, 0);

        const score1 = targetDesign.calculateScore(impactPoint1);
        const score2 = targetDesign.calculateScore(impactPoint2);

        expect(score1.equals(score2)).toBe(true);
      });
    });
  });

  describe('isInnerTen() boundary value tests', () => {
    it('JRSF_BR_10M (xRingRadius=2.25mm): distance 2.24mm should be innerTen=true', () => {
      const targetDesign = TargetDesign.forDiscipline(Discipline.beamRifle10m());
      const impactPoint = new ImpactPoint(2.24, 0);
      expect(targetDesign.isInnerTen(impactPoint)).toBe(true);
    });

    it('JRSF_BR_10M (xRingRadius=2.25mm): distance 2.26mm should be innerTen=false', () => {
      const targetDesign = TargetDesign.forDiscipline(Discipline.beamRifle10m());
      const impactPoint = new ImpactPoint(2.26, 0);
      expect(targetDesign.isInnerTen(impactPoint)).toBe(false);
    });

    it('JRSF_BP_10M (xRingRadius=5.0mm): distance 4.99mm should be innerTen=true', () => {
      const targetDesign = TargetDesign.forDiscipline(Discipline.airPistol10m());
      const impactPoint = new ImpactPoint(4.99, 0);
      expect(targetDesign.isInnerTen(impactPoint)).toBe(true);
    });

    it('JRSF_BP_10M (xRingRadius=5.0mm): distance 5.01mm should be innerTen=false', () => {
      const targetDesign = TargetDesign.forDiscipline(Discipline.airPistol10m());
      const impactPoint = new ImpactPoint(5.01, 0);
      expect(targetDesign.isInnerTen(impactPoint)).toBe(false);
    });

    it('AIR_PISTOL_10M (xRingRadius=5.0mm): distance 4.99mm should be innerTen=true', () => {
      const targetDesign = TargetDesign.forDiscipline(Discipline.airPistol10m());
      const impactPoint = new ImpactPoint(4.99, 0);
      expect(targetDesign.isInnerTen(impactPoint)).toBe(true);
    });

    it('AIR_PISTOL_10M (xRingRadius=5.0mm): distance 5.01mm should be innerTen=false', () => {
      const targetDesign = TargetDesign.forDiscipline(Discipline.airPistol10m());
      const impactPoint = new ImpactPoint(5.01, 0);
      expect(targetDesign.isInnerTen(impactPoint)).toBe(false);
    });

    it('impactPoint=null → innerTen=false', () => {
      const targetDesign = TargetDesign.forDiscipline(Discipline.beamRifle10m());
      expect(targetDesign.isInnerTen(null)).toBe(false);
    });
  });

  describe('AIR_PISTOL_10M (AP) discipline-specific tests', () => {
    let targetDesign: TargetDesign;
    let discipline: Discipline;

    beforeEach(() => {
      discipline = Discipline.airPistol10m();
      targetDesign = TargetDesign.forDiscipline(discipline);
    });

    describe('AP ring definition verification', () => {
      it('should have 100 rings', () => {
        expect(targetDesign.rings).toHaveLength(100);
      });

      it('should have a score range from 10.9 to 1.0', () => {
        expect(targetDesign.rings[0]?.score).toBe(109);
        expect(targetDesign.rings[99]?.score).toBe(10);
      });

      it('should have the 10.0 boundary at 8.00mm', () => {
        const ring10_0 = targetDesign.rings.find((r) => r.score === 100);
        expect(ring10_0).toBeDefined();
        expect(ring10_0!.radius).toBe(8.0);
      });

      it('should have the 10.9 (inner ten) at 0.80mm', () => {
        expect(targetDesign.rings[0]?.radius).toBeCloseTo(0.8, 4);
      });

      it('should have the 1.0 boundary at 80.00mm', () => {
        const ring1_0 = targetDesign.rings.find((r) => r.score === 10);
        expect(ring1_0).toBeDefined();
        expect(ring1_0!.radius).toBe(80.0);
      });

      it('should have the 9.0 boundary at 16.00mm', () => {
        const ring9_0 = targetDesign.rings.find((r) => r.score === 90);
        expect(ring9_0).toBeDefined();
        expect(ring9_0!.radius).toBe(16.0);
      });
    });

    describe('AP and AR should score differently for the same impact point (regression test)', () => {
      it('should score differently between AP and AR at 5.0mm', () => {
        const arDesign = TargetDesign.forDiscipline(Discipline.airRifle10m());
        const impactPoint = new ImpactPoint(5.0, 0);

        const apScore = targetDesign.calculateScore(impactPoint);
        const arScore = arDesign.calculateScore(impactPoint);

        // AR: 5.0mm = 9.0 (boundary at 5.0)
        // AP: 5.0mm = 10.3 (10.3 boundary at 5.60mm)
        expect(apScore.value).not.toBe(arScore.value);
        expect(apScore.value).toBeGreaterThan(arScore.value);
      });

      it('should score differently between AP and AR at 20.0mm', () => {
        const arDesign = TargetDesign.forDiscipline(Discipline.airRifle10m());
        const impactPoint = new ImpactPoint(20.0, 0);

        const apScore = targetDesign.calculateScore(impactPoint);
        const arScore = arDesign.calculateScore(impactPoint);

        expect(apScore.value).not.toBe(arScore.value);
      });
    });

    describe('AP score calculation accuracy', () => {
      it('should score inner ten (10.9) for center (0, 0)', () => {
        const impactPoint = new ImpactPoint(0, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(109);
      });

      it('should score 10.0 for 8.00mm (10.0 boundary)', () => {
        const impactPoint = new ImpactPoint(8.0, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(100);
      });

      it('should score 9.0 for 16.00mm (9.0 boundary)', () => {
        const impactPoint = new ImpactPoint(16.0, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(90);
      });

      it('should score 1.0 for 80.00mm (1.0 boundary)', () => {
        const impactPoint = new ImpactPoint(80.0, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(10);
      });

      it('should score 0.0 for 80.01mm (outside target)', () => {
        const impactPoint = new ImpactPoint(80.01, 0);
        const score = targetDesign.calculateScore(impactPoint);
        expect(score.value).toBe(0);
      });
    });
  });
});
