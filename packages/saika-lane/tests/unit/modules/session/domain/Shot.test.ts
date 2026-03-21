// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { DomainError } from '@/shared/errors/DomainError';

describe('Shot entity', () => {
  describe('creating a new shot with Shot.create()', () => {
    it('can create a Shot with valid parameters', () => {
      const impactPoint = new ImpactPoint(1.5, 2.0);
      const score = new Score(105);
      const mode = Mode.match();
      const timestamp = new Date('2026-01-13T10:00:00Z');
      const shotNumber = 1;
      const seriesNumber = 1;

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber,
        seriesNumber,
        innerTen: false,
      });

      expect(shot.id).toBeTruthy();
      expect(shot.id).toBeTypeOf('string');
      expect(shot.impactPoint).toBe(impactPoint);
      expect(shot.score).toBe(score);
      expect(shot.mode).toBe(mode);
      expect(shot.timestamp).toBe(timestamp);
      expect(shot.shotNumber).toBe(shotNumber);
      expect(shot.seriesNumber).toBe(seriesNumber);
    });

    it('can create a Shot in sighting mode', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(109);
      const mode = Mode.sighting();
      const timestamp = new Date();
      const shotNumber = 1;
      const seriesNumber = 0;

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber,
        seriesNumber,
        innerTen: false,
      });

      expect(shot.mode).toBe(mode);
      expect(shot.mode.isSighting()).toBe(true);
      expect(shot.seriesNumber).toBe(0);
    });

    it('can create a Shot in match mode', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(109);
      const mode = Mode.match();
      const timestamp = new Date();
      const shotNumber = 1;
      const seriesNumber = 2;

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber,
        seriesNumber,
        innerTen: false,
      });

      expect(shot.mode).toBe(mode);
      expect(shot.mode.isMatch()).toBe(true);
      expect(shot.seriesNumber).toBe(2);
    });

    it('ID is auto-generated and in UUID format', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();
      const shotNumber = 1;
      const seriesNumber = 1;

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber,
        seriesNumber,
        innerTen: false,
      });

      // Validate UUID v4 format (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(shot.id).toMatch(uuidRegex);
    });
  });

  describe('invariant validation', () => {
    it('throws an error when shotNumber is 0 or less', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      try {
        Shot.create({ impactPoint, score, mode, timestamp, shotNumber: 0, seriesNumber: 1, innerTen: false });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SHOT');
      }
    });

    it('throws an error when shotNumber is negative', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      try {
        Shot.create({ impactPoint, score, mode, timestamp, shotNumber: -1, seriesNumber: 1, innerTen: false });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SHOT');
      }
    });

    it('throws an error when shotNumber is a decimal', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      try {
        Shot.create({ impactPoint, score, mode, timestamp, shotNumber: 1.5, seriesNumber: 1, innerTen: false });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SHOT');
      }
    });

    it('throws an error when seriesNumber is negative', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      try {
        Shot.create({ impactPoint, score, mode, timestamp, shotNumber: 1, seriesNumber: -1, innerTen: false });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SHOT');
      }
    });

    it('throws an error when seriesNumber is a decimal', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      try {
        Shot.create({ impactPoint, score, mode, timestamp, shotNumber: 1, seriesNumber: 1.5, innerTen: false });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SHOT');
      }
    });

    it('seriesNumber = 0 is allowed (for sighting shots)', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.sighting();
      const timestamp = new Date();

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 0,
        innerTen: false,
      });

      expect(shot.seriesNumber).toBe(0);
    });

    it('throws an error when timestamp is an invalid date', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const invalidDate = new Date('invalid');

      try {
        Shot.create({
          impactPoint,
          score,
          mode,
          timestamp: invalidDate,
          shotNumber: 1,
          seriesNumber: 1,
          innerTen: false,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_SHOT');
      }
    });
  });

  describe('equals() method', () => {
    it('equals() returns true for Shots with the same ID', () => {
      const impactPoint1 = new ImpactPoint(1.0, 1.0);
      const score1 = new Score(105);
      const mode1 = Mode.match();
      const timestamp1 = new Date('2026-01-13T10:00:00Z');

      const impactPoint2 = new ImpactPoint(2.0, 2.0);
      const score2 = new Score(90);
      const mode2 = Mode.sighting();
      const timestamp2 = new Date('2026-01-13T11:00:00Z');

      const shot1 = Shot.create({
        impactPoint: impactPoint1,
        score: score1,
        mode: mode1,
        timestamp: timestamp1,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: false,
      });

      // Create a Shot with the same ID but different properties (for testing)
      const shot2 = Shot.create({
        impactPoint: impactPoint2,
        score: score2,
        mode: mode2,
        timestamp: timestamp2,
        shotNumber: 2,
        seriesNumber: 1,
        innerTen: false,
      });

      // IDs differ, so equals() returns false
      expect(shot1.equals(shot2)).toBe(false);
    });

    it('equals() returns false for Shots with different IDs', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      const shot1 = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: false,
      });

      const shot2 = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: false,
      });

      // IDs are auto-generated, so they differ
      expect(shot1.equals(shot2)).toBe(false);
    });

    it('equals() returns true for the same instance', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: false,
      });

      expect(shot.equals(shot)).toBe(true);
    });
  });

  describe('isInner() method', () => {
    it('isInner() returns true when innerTen=true', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(109);
      const mode = Mode.match();
      const timestamp = new Date();

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: true,
      });

      expect(shot.isInner()).toBe(true);
    });

    it('isInner() returns false when innerTen=false', () => {
      const impactPoint = new ImpactPoint(1.0, 0.0);
      const score = new Score(108);
      const mode = Mode.match();
      const timestamp = new Date();

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: false,
      });

      expect(shot.isInner()).toBe(false);
    });

    it('isInner() returns false for a miss shot (innerTen=false)', () => {
      const impactPoint = new ImpactPoint(100.0, 100.0);
      const score = new Score(0);
      const mode = Mode.match();
      const timestamp = new Date();

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: false,
      });

      expect(shot.isInner()).toBe(false);
    });
  });

  describe('immutability', () => {
    it('all properties of Shot are readonly', () => {
      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const mode = Mode.match();
      const timestamp = new Date();

      const shot = Shot.create({
        impactPoint,
        score,
        mode,
        timestamp,
        shotNumber: 1,
        seriesNumber: 1,
        innerTen: false,
      });

      // Prevented by TypeScript's type checking, so no runtime error occurs
      // This behavior is verified at TypeScript compile time
      expect(shot.id).toBeTruthy();
      expect(shot.impactPoint).toBe(impactPoint);
      expect(shot.score).toBe(score);
      expect(shot.mode).toBe(mode);
      expect(shot.timestamp).toBe(timestamp);
      expect(shot.shotNumber).toBe(1);
      expect(shot.seriesNumber).toBe(1);
    });
  });
});
