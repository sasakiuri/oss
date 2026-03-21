// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { MT201ShotFactory } from '@/main/modules/target/adapters/mt201/MT201ShotFactory';

const defaultContext = (): AdapterContext => ({
  shotNumber: 1,
  discipline: Discipline.beamRifle10m(),
  mode: Mode.sighting(),
});

describe('MT201ShotFactory', () => {
  let factory: MT201ShotFactory;

  beforeEach(() => {
    factory = new MT201ShotFactory();
  });

  describe('createShot()', () => {
    it('should create a valid Shot', () => {
      const impactPoint = new ImpactPoint(3.947, -1.073);
      const score = new Score(97);
      const timestamp = new Date('2024-01-15T10:30:00Z');
      const context = defaultContext();

      const shot = factory.createShot(impactPoint, score, timestamp, context, false);

      expect(shot.impactPoint!.x).toBeCloseTo(3.947, 2);
      expect(shot.impactPoint!.y).toBeCloseTo(-1.073, 2);
      expect(shot.score.value).toBe(97);
      expect(shot.timestamp).toEqual(timestamp);
      expect(shot.shotNumber).toBe(1);
      expect(shot.mode.value).toBe('SIGHTING');
      expect(shot.seriesNumber).toBe(0);
    });

    it('should reflect context shotNumber in the Shot', () => {
      const impactPoint = new ImpactPoint(0, 0);
      const score = new Score(100);
      const timestamp = new Date();

      const shot = factory.createShot(
        impactPoint,
        score,
        timestamp,
        {
          ...defaultContext(),
          shotNumber: 5,
        },
        false,
      );

      expect(shot.shotNumber).toBe(5);
    });

    it('should reflect context mode in the Shot', () => {
      const impactPoint = new ImpactPoint(0, 0);
      const score = new Score(95);
      const timestamp = new Date();

      const shot = factory.createShot(
        impactPoint,
        score,
        timestamp,
        {
          ...defaultContext(),
          mode: Mode.match(),
        },
        false,
      );

      expect(shot.mode.value).toBe('MATCH');
      expect(shot.mode.isMatch()).toBe(true);
    });

    it('should always create with seriesNumber 0', () => {
      const impactPoint = new ImpactPoint(1.0, 2.0);
      const score = new Score(80);
      const timestamp = new Date();

      const shot = factory.createShot(impactPoint, score, timestamp, defaultContext(), false);

      expect(shot.seriesNumber).toBe(0);
    });

    it('should produce an immutable Shot', () => {
      const impactPoint = new ImpactPoint(0, 0);
      const score = new Score(100);
      const timestamp = new Date();

      const shot = factory.createShot(impactPoint, score, timestamp, defaultContext(), false);

      expect(() => {
        (shot as any).shotNumber = 999;
      }).toThrow();
    });
  });

  describe('createMissShot()', () => {
    it('should create a miss shot', () => {
      const timestamp = new Date('2024-01-15T10:30:00Z');
      const context = defaultContext();

      const shot = factory.createMissShot(timestamp, context);

      expect(shot.impactPoint).toBeNull();
      expect(shot.score.value).toBe(0);
      expect(shot.timestamp).toEqual(timestamp);
      expect(shot.shotNumber).toBe(1);
      expect(shot.mode.value).toBe('SIGHTING');
      expect(shot.seriesNumber).toBe(0);
    });

    it('should reflect context shotNumber even for miss shots', () => {
      const timestamp = new Date();

      const shot = factory.createMissShot(timestamp, {
        ...defaultContext(),
        shotNumber: 3,
      });

      expect(shot.shotNumber).toBe(3);
    });

    it('should reflect context mode even for miss shots', () => {
      const timestamp = new Date();

      const shot = factory.createMissShot(timestamp, {
        ...defaultContext(),
        mode: Mode.match(),
      });

      expect(shot.mode.value).toBe('MATCH');
    });

    it('should have null coordinates for miss shots', () => {
      const timestamp = new Date();

      const shot = factory.createMissShot(timestamp, defaultContext());

      expect(shot.impactPoint).toBeNull();
    });

    it('should have a score of 0.0 for miss shots', () => {
      const timestamp = new Date();

      const shot = factory.createMissShot(timestamp, defaultContext());

      expect(shot.score.value).toBe(0);
    });

    it('should produce an immutable miss shot', () => {
      const timestamp = new Date();

      const shot = factory.createMissShot(timestamp, defaultContext());

      expect(() => {
        (shot as any).shotNumber = 999;
      }).toThrow();
    });
  });
});
