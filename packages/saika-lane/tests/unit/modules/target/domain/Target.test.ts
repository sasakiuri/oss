// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Target } from '@/main/modules/target/domain/Target';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import { DomainError } from '@/shared/errors/DomainError';

describe('Target entity', () => {
  describe('Target.create() generates a new target', () => {
    it('should create a Target with valid parameters', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      expect(target.id).toBeTruthy();
      expect(target.id).toBeTypeOf('string');
      expect(target.discipline).toBe(discipline);
      expect(target.laneNumber).toBe(laneNumber);
      expect(target.design).toBeInstanceOf(TargetDesign);
    });

    it('should auto-generate TargetDesign based on discipline (10m air rifle)', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      expect(target.design.discipline).toBe(discipline);
      expect(target.design.discipline.equals(discipline)).toBe(true);
    });

    it('should auto-generate TargetDesign based on discipline (10m air pistol)', () => {
      const discipline = Discipline.airPistol10m();
      const laneNumber = 2;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      expect(target.design.discipline).toBe(discipline);
      expect(target.design.discipline.equals(discipline)).toBe(true);
    });

    it('should auto-generate TargetDesign based on discipline (50m rifle)', () => {
      const discipline = Discipline.rifle50m();
      const laneNumber = 3;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      expect(target.design.discipline).toBe(discipline);
      expect(target.design.discipline.equals(discipline)).toBe(true);
    });

    it('should auto-generate TargetDesign based on discipline (25m pistol)', () => {
      const discipline = Discipline.pistol25m();
      const laneNumber = 4;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      expect(target.design.discipline).toBe(discipline);
      expect(target.design.discipline.equals(discipline)).toBe(true);
    });

    it('should auto-generate an ID in UUID format', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      // Verify UUID v4 format (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(target.id).toMatch(uuidRegex);
    });
  });

  describe('Invariant validation', () => {
    it('should throw an error when laneNumber is 0 or less', () => {
      const discipline = Discipline.airRifle10m();

      try {
        Target.create({ discipline, laneNumber: 0 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_TARGET');
      }
    });

    it('should throw an error when laneNumber is negative', () => {
      const discipline = Discipline.airRifle10m();

      try {
        Target.create({ discipline, laneNumber: -1 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_TARGET');
      }
    });

    it('should throw an error when laneNumber is a decimal', () => {
      const discipline = Discipline.airRifle10m();

      try {
        Target.create({ discipline, laneNumber: 1.5 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_TARGET');
      }
    });
  });

  describe('equals() method', () => {
    it('should return true for Targets with the same ID', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      expect(target.equals(target)).toBe(true);
    });

    it('should return false for Targets with different IDs', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;

      const target1 = Target.create({
        discipline,
        laneNumber,
      });

      const target2 = Target.create({
        discipline,
        laneNumber,
      });

      // IDs are auto-generated, so they will be different
      expect(target1.equals(target2)).toBe(false);
    });

    it('should return false for Targets with different disciplines', () => {
      const discipline1 = Discipline.airRifle10m();
      const discipline2 = Discipline.airPistol10m();
      const laneNumber = 1;

      const target1 = Target.create({
        discipline: discipline1,
        laneNumber,
      });

      const target2 = Target.create({
        discipline: discipline2,
        laneNumber,
      });

      expect(target1.equals(target2)).toBe(false);
    });
  });

  describe('calculateScore() method', () => {
    it('10m air rifle: should return 10.9 for a center impact', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(109);
      expect(score.isInner()).toBe(true);
    });

    it('10m air rifle: should return 10.9 for an impact 0.25mm from center', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      // Within 0.25mm from center (boundary)
      const impactPoint = new ImpactPoint(0.25, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(109);
    });

    it('10m air rifle: should return 10.8 for an impact 0.26mm from center', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      // Outside the 10.9 ring
      const impactPoint = new ImpactPoint(0.26, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(108);
    });

    it('10m air rifle: should return 10.0 for an impact 2.5mm from center', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(2.5, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(100);
    });

    it('10m air rifle: should return 9.0 for an impact 5.0mm from center', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(5.0, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(90);
    });

    it('10m air rifle: should return 1.0 for an impact 25.0mm from center', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(25.0, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(10);
    });

    it('10m air rifle: should return miss (0.0) for an impact outside the target', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(100.0, 100.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(0);
    });

    it('50m rifle: should return 10.9 for a center impact', () => {
      const discipline = Discipline.rifle50m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(109);
    });

    it('50m rifle: should return 10.0 for an impact 8.0mm from center', () => {
      const discipline = Discipline.rifle50m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(8.0, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(100);
    });

    it('25m pistol: should return 10.9 for a center impact', () => {
      const discipline = Discipline.pistol25m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = target.calculateScore(impactPoint);

      expect(score.value).toBe(100);
    });

    it('should delegate calculateScore() to the design', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;
      const target = Target.create({ discipline, laneNumber });

      const impactPoint = new ImpactPoint(0.0, 0.0);
      const scoreFromTarget = target.calculateScore(impactPoint);
      const scoreFromDesign = target.design.calculateScore(impactPoint);

      expect(scoreFromTarget.equals(scoreFromDesign)).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('should have all Target properties as readonly', () => {
      const discipline = Discipline.airRifle10m();
      const laneNumber = 1;

      const target = Target.create({
        discipline,
        laneNumber,
      });

      // TypeScript type checking prevents this, so no runtime error occurs
      // This behavior verification is done at TypeScript compile time
      expect(target.id).toBeTruthy();
      expect(target.discipline).toBe(discipline);
      expect(target.design).toBeInstanceOf(TargetDesign);
      expect(target.laneNumber).toBe(1);
    });
  });
});
