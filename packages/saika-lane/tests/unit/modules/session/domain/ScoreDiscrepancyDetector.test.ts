// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { IScoreDiscrepancyLogger } from '@/main/modules/session/domain/IScoreDiscrepancyLogger';
import { Score } from '@/main/modules/session/domain/Score';
import { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => mockLogger,
}));

describe('ScoreDiscrepancyDetector', () => {
  let mockCsvLogger: IScoreDiscrepancyLogger;
  let detector: ScoreDiscrepancyDetector;

  const baseContext = {
    impactPoint: new ImpactPoint(5.2, -3.8),
    timestamp: new Date('2026-02-19T10:00:00Z'),
    sessionId: 'session-1',
    discipline: 'AIR_RIFLE_10M',
    mode: 'MATCH',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCsvLogger = { log: vi.fn() };
    detector = new ScoreDiscrepancyDetector(mockCsvLogger);
  });

  describe('no discrepancy (skip)', () => {
    it('does nothing when device score and calculated app score match', () => {
      detector.detect({
        ...baseContext,
        deviceScore: 105,
        calculatedScore: new Score(105),
      });

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockCsvLogger.log).not.toHaveBeenCalled();
    });

    it('does nothing when scores match after rounding', () => {
      detector.detect({
        ...baseContext,
        deviceScore: 100,
        calculatedScore: new Score(100),
      });

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockCsvLogger.log).not.toHaveBeenCalled();
    });
  });

  describe('discrepancy detected (detect + log)', () => {
    it('outputs a warning log when a discrepancy exists', () => {
      detector.detect({
        ...baseContext,
        deviceScore: 98,
        calculatedScore: new Score(105),
      });

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Score discrepancy detected'),
        'domain',
        expect.objectContaining({
          deviceScore: 98,
          calculatedScore: 105,
          distance: expect.any(Number),
          impactPoint: { x: 5.2, y: -3.8 },
          sessionId: 'session-1',
        }),
      );
    });

    it('logs a record to the CSV logger when a discrepancy exists', () => {
      const timestamp = new Date('2026-02-19T10:00:00Z');
      const impactPoint = new ImpactPoint(5.2, -3.8);

      detector.detect({
        deviceScore: 98,
        calculatedScore: new Score(105),
        impactPoint,
        timestamp,
        sessionId: 'session-1',
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
      });

      expect(mockCsvLogger.log).toHaveBeenCalledTimes(1);
      expect(mockCsvLogger.log).toHaveBeenCalledWith({
        timestamp,
        sessionId: 'session-1',
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
        deviceScore: 98,
        appScore: 105,
        diff: 105 - 98,
        distance: impactPoint.distanceFromCenter(),
        x: 5.2,
        y: -3.8,
      });
    });

    it('log message contains device and app score values', () => {
      detector.detect({
        ...baseContext,
        deviceScore: 80,
        calculatedScore: new Score(95),
      });

      const logMessage = mockLogger.warn.mock.calls[0]![0] as string;
      expect(logMessage).toContain('device=8.0');
      expect(logMessage).toContain('app calculated=9.5');
    });

    it('log message contains distance and coordinates', () => {
      detector.detect({
        ...baseContext,
        deviceScore: 80,
        calculatedScore: new Score(95),
      });

      const logMessage = mockLogger.warn.mock.calls[0]![0] as string;
      expect(logMessage).toContain('distance=');
      expect(logMessage).toContain('coordinates=(5.200, -3.800)');
    });

    it('diff field is calculated as calculatedScore - deviceScore', () => {
      detector.detect({
        ...baseContext,
        deviceScore: 70,
        calculatedScore: new Score(100),
      });

      const record = (mockCsvLogger.log as any).mock.calls[0][0];
      // calculatedScore.value=100, deviceScoreObj.value=70, diff=30
      expect(record.diff).toBe(30);
    });
  });

  describe('CSV write errors', () => {
    it('does not propagate exceptions when CSV logger throws an error', () => {
      (mockCsvLogger.log as any).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => {
        detector.detect({
          ...baseContext,
          deviceScore: 90,
          calculatedScore: new Score(100),
        });
      }).not.toThrow();
    });

    it('CSV logger errors are recorded in the error log', () => {
      (mockCsvLogger.log as any).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      detector.detect({
        ...baseContext,
        deviceScore: 90,
        calculatedScore: new Score(100),
      });

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write CSV discrepancy log'),
        'domain',
      );
    });

    it('CSV logger error message is included in the error log', () => {
      (mockCsvLogger.log as any).mockImplementation(() => {
        throw new Error('disk full');
      });

      detector.detect({
        ...baseContext,
        deviceScore: 90,
        calculatedScore: new Score(100),
      });

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('disk full'), 'domain');
    });

    it('non-Error objects that are thrown are stringified', () => {
      (mockCsvLogger.log as any).mockImplementation(() => {
        throw 'string error';
      });

      detector.detect({
        ...baseContext,
        deviceScore: 90,
        calculatedScore: new Score(100),
      });

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('string error'), 'domain');
    });
  });

  describe('boundary values', () => {
    it('detects even when scores differ by only 0.1', () => {
      detector.detect({
        ...baseContext,
        deviceScore: 100,
        calculatedScore: new Score(101),
      });

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockCsvLogger.log).toHaveBeenCalledTimes(1);
    });

    it('works correctly with center coordinates (0,0)', () => {
      detector.detect({
        ...baseContext,
        impactPoint: new ImpactPoint(0, 0),
        deviceScore: 100,
        calculatedScore: new Score(109),
      });

      const record = (mockCsvLogger.log as any).mock.calls[0][0];
      expect(record.distance).toBe(0);
      expect(record.x).toBe(0);
      expect(record.y).toBe(0);
    });
  });
});
