// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { SessionFactory, SessionStorageData } from '@/main/modules/session/domain/SessionFactory';

describe('SessionFactory', () => {
  describe('fromStorageData()', () => {
    it('restoring from storage data with empty series array supplements the initial series', () => {
      const data: SessionStorageData = {
        id: 'test-session-id',
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
        series: [],
        allShots: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        scoringMode: 'DECIMAL',
      };

      const session = SessionFactory.fromStorageData(data);

      expect(session.series).toHaveLength(1);
      expect(session.series[0]?.seriesNumber).toBe(1);
    });

    it('empty series + MATCH shots present causes INVALID_SESSION_STATE error', () => {
      const data: SessionStorageData = {
        id: 'test-session-id',
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
        series: [],
        allShots: [
          {
            id: 'shot-1',
            shotNumber: 1,
            impactPoint: { x: 1.0, y: 1.0 },
            score: 100,
            innerTen: false,
            timestamp: new Date().toISOString(),
            seriesNumber: 1,
            mode: 'MATCH',
          },
        ],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        scoringMode: 'DECIMAL',
      };

      expect(() => SessionFactory.fromStorageData(data)).toThrow(
        expect.objectContaining({
          code: 'INVALID_SESSION_STATE',
        }),
      );
    });

    it('empty series + sighting shots only supplements the initial series', () => {
      const data: SessionStorageData = {
        id: 'test-session-id',
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
        series: [],
        allShots: [
          {
            id: 'shot-1',
            shotNumber: 1,
            impactPoint: { x: 1.0, y: 1.0 },
            score: 100,
            innerTen: false,
            timestamp: new Date().toISOString(),
            seriesNumber: 0,
            mode: 'SIGHTING',
          },
        ],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        scoringMode: 'DECIMAL',
      };

      const session = SessionFactory.fromStorageData(data);

      expect(session.series).toHaveLength(1);
      expect(session.series[0]?.seriesNumber).toBe(1);
    });

    it('restores normally from storage data that contains series', () => {
      const data: SessionStorageData = {
        id: 'test-session-id',
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
        series: [
          { seriesNumber: 1, totalScore: 0, maxShots: 10 },
          { seriesNumber: 2, totalScore: 500, maxShots: 10 },
        ],
        allShots: [
          {
            id: 'shot-1',
            shotNumber: 1,
            impactPoint: { x: 1.0, y: 1.0 },
            score: 100,
            innerTen: false,
            timestamp: new Date().toISOString(),
            seriesNumber: 2,
            mode: 'MATCH',
          },
        ],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        scoringMode: 'DECIMAL',
      };

      const session = SessionFactory.fromStorageData(data);

      expect(session.series).toHaveLength(2);
      expect(session.series[0]?.seriesNumber).toBe(1);
      expect(session.series[1]?.seriesNumber).toBe(2);
    });
  });
});
