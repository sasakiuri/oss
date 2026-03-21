// SPDX-License-Identifier: MIT
import fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { formatJsonLine, formatTimestamp, ShotLogService } from '@/main/modules/session/infra/ShotLogService';

import { buildImpactPoint, buildScore, buildShot } from '../../../../helpers/factories';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
  },
}));

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('formatJsonLine', () => {
  const discipline = Discipline.airRifle10m();
  const defaultContext = { sessionId: 'session-001', scoringMode: 'DECIMAL' as const };

  it('should correctly serialize a normal shot (with coordinates, without deviceScore)', () => {
    const shot = buildShot({
      score: buildScore(92),
      impactPoint: buildImpactPoint({ x: 1.95, y: -7.76 }),
      innerTen: false,
      mode: Mode.match(),
      seriesNumber: 1,
      shotNumber: 3,
    });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(result.score).toBe(92);
    expect(result.deviceScore).toBeNull();
    expect(result.x).toBe(1.95);
    expect(result.y).toBe(-7.76);
    expect(result.innerTen).toBe(false);
    expect(result.discipline).toBe('AIR_RIFLE_10M');
    expect(result.mode).toBe('MATCH');
  });

  it('should handle inner-ten shot (innerTen=true)', () => {
    const shot = buildShot({
      score: buildScore(104),
      innerTen: true,
    });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(result.score).toBe(104);
    expect(result.innerTen).toBe(true);
  });

  it('should handle a miss shot (impactPoint=null)', () => {
    const shot = Shot.create({
      impactPoint: null,
      score: new Score(0),
      mode: Mode.match(),
      timestamp: new Date('2026-01-15T10:00:00Z'),
      shotNumber: 1,
      seriesNumber: 1,
      innerTen: false,
    });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(result.x).toBeNull();
    expect(result.y).toBeNull();
    expect(result.score).toBe(0);
  });

  it('should output deviceScore when present', () => {
    const shot = buildShot({
      score: buildScore(92),
      deviceScore: buildScore(91),
    });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(result.score).toBe(92);
    expect(result.deviceScore).toBe(91);
  });

  it('should output score as an integer value', () => {
    const shot = buildShot({
      score: buildScore(92),
    });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(result.score).toBe(92);
  });

  it('should output deviceScore as an integer value', () => {
    const shot = buildShot({
      score: buildScore(92),
      deviceScore: buildScore(91),
    });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(result.deviceScore).toBe(91);
  });

  it('should handle sighting mode (mode=SIGHTING)', () => {
    const shot = buildShot({
      mode: Mode.sighting(),
      seriesNumber: 0,
      shotNumber: 1,
    });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(result.mode).toBe('SIGHTING');
    expect(result.seriesNumber).toBe(0);
  });

  it('should output null for deviceScore when not specified (field order consistency)', () => {
    const shot = buildShot({ deviceScore: undefined });

    const result = JSON.parse(formatJsonLine(shot, discipline, defaultContext));

    expect(Object.prototype.hasOwnProperty.call(result, 'deviceScore')).toBe(true);
    expect(result.deviceScore).toBeNull();
  });

  describe('sessionId / scoringMode / rawScore', () => {
    it('should output sessionId', () => {
      const shot = buildShot({ score: buildScore(95) });

      const result = JSON.parse(formatJsonLine(shot, discipline, { sessionId: 'session-xyz', scoringMode: 'DECIMAL' }));

      expect(result.sessionId).toBe('session-xyz');
    });

    it('should not output rawScore in DECIMAL mode', () => {
      const shot = buildShot({ score: buildScore(95) });

      const result = JSON.parse(
        formatJsonLine(shot, discipline, { sessionId: 'session-001', scoringMode: 'DECIMAL', rawScore: undefined }),
      );

      expect(Object.prototype.hasOwnProperty.call(result, 'rawScore')).toBe(false);
    });

    it('should output rawScore in RING mode when value has changed', () => {
      const shot = buildShot({ score: buildScore(90) });

      const result = JSON.parse(
        formatJsonLine(shot, discipline, { sessionId: 'session-001', scoringMode: 'RING', rawScore: 9.2 }),
      );

      expect(result.scoringMode).toBe('RING');
      expect(result.rawScore).toBe(9.2);
    });

    it('should not output rawScore key in RING mode when rawScore is undefined', () => {
      const shot = buildShot({ score: buildScore(90) });

      const result = JSON.parse(
        formatJsonLine(shot, discipline, { sessionId: 'session-001', scoringMode: 'RING', rawScore: undefined }),
      );

      expect(Object.prototype.hasOwnProperty.call(result, 'rawScore')).toBe(false);
    });
  });
});

describe('formatTimestamp', () => {
  it('should convert a Date to YYYYMMDDHHMMSS format', () => {
    const date = new Date(2026, 1, 23, 14, 30, 5); // 2026-02-23 14:30:05
    expect(formatTimestamp(date)).toBe('20260223143005');
  });

  it('should zero-pad single-digit month, day, hour, minute, and second', () => {
    const date = new Date(2026, 0, 5, 9, 3, 7); // 2026-01-05 09:03:07
    expect(formatTimestamp(date)).toBe('20260105090307');
  });
});

describe('ShotLogService: Shots continue to be appended after SessionReset', () => {
  it('should append shots to the same file after SessionReset', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.appendFileSync).mockImplementation(() => undefined);

    const service = new ShotLogService('/tmp/test-userdata');

    service.handleSessionStarted({
      type: 'SessionStarted',
      aggregateId: 'session-abc',
      timestamp: Date.now(),
      discipline: Discipline.airRifle10m(),
    });

    const shotAfterReset = Shot.create({
      impactPoint: buildImpactPoint(),
      score: new Score(95),
      mode: Mode.match(),
      timestamp: new Date('2026-01-15T10:00:01Z'),
      shotNumber: 2,
      seriesNumber: 1,
      innerTen: false,
    });

    vi.mocked(fs.appendFileSync).mockClear();
    service.handleShotRecorded({
      type: 'ShotRecorded',
      aggregateId: 'session-abc',
      timestamp: Date.now(),
      shot: shotAfterReset,
      scoringMode: 'DECIMAL',
    });

    // Shots are appended to the file even after reset
    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
  });
});
