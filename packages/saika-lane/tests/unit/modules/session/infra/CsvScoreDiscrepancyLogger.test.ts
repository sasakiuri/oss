// SPDX-License-Identifier: MIT
import fs from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScoreDiscrepancyRecord } from '@/main/modules/session/domain/IScoreDiscrepancyLogger';
import { CsvScoreDiscrepancyLogger } from '@/main/modules/session/infra/CsvScoreDiscrepancyLogger';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/mock/userData') },
}));

const HEADER = 'timestamp,sessionId,discipline,mode,deviceScore,appScore,diff,distance,x,y';

function createRecord(overrides?: Partial<ScoreDiscrepancyRecord>): ScoreDiscrepancyRecord {
  return {
    timestamp: new Date('2026-02-19T10:30:00.000Z'),
    sessionId: 'session-001',
    discipline: 'AR60',
    mode: 'sighting',
    deviceScore: 105,
    appScore: 103,
    diff: 2,
    distance: 4.123,
    x: 1.234,
    y: -2.567,
    ...overrides,
  };
}

describe('CsvScoreDiscrepancyLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates directory if not exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const logger = new CsvScoreDiscrepancyLogger('/tmp/test-logs');
    logger.log(createRecord());

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.normalize('/tmp/test-logs'), { recursive: true, mode: 0o700 });
  });

  it('writes header on first call when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const logger = new CsvScoreDiscrepancyLogger('/tmp/test-logs');
    logger.log(createRecord());

    expect(fs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('score-discrepancy.csv'), HEADER + '\n');
  });

  it('appends data line with correct formatting', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const logger = new CsvScoreDiscrepancyLogger('/tmp/test-logs');
    logger.log(createRecord());

    const expectedLine = '2026-02-19T10:30:00.000Z,session-001,AR60,sighting,10.5,10.3,0.2,4.123,1.234,-2.567\n';

    expect(fs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('score-discrepancy.csv'), expectedLine);
  });

  it('does not write header if file already exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const logger = new CsvScoreDiscrepancyLogger('/tmp/test-logs');
    logger.log(createRecord());

    // appendFileSync should be called once (data line only), not twice (header + data)
    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    expect(fs.appendFileSync).not.toHaveBeenCalledWith(expect.anything(), HEADER + '\n');
  });

  it('produces correct CSV format with proper decimal places', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const logger = new CsvScoreDiscrepancyLogger('/tmp/test-logs');
    logger.log(
      createRecord({
        deviceScore: 90,
        appScore: 80,
        diff: 10,
        distance: 5.0,
        x: 0.0,
        y: 0.0,
      }),
    );

    const appendCall = vi.mocked(fs.appendFileSync).mock.calls[0]![1] as string;
    const fields = appendCall.trim().split(',');

    // scores: 1 decimal
    expect(fields[4]).toBe('9.0');
    expect(fields[5]).toBe('8.0');
    // diff: 1 decimal
    expect(fields[6]).toBe('1.0');
    // distance: 3 decimals
    expect(fields[7]).toBe('5.000');
    // x, y: 3 decimals
    expect(fields[8]).toBe('0.000');
    expect(fields[9]).toBe('0.000');
  });

  it('uses custom logsDir via constructor parameter', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const customDir = '/custom/log/path';
    const logger = new CsvScoreDiscrepancyLogger(customDir);
    logger.log(createRecord());

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.normalize(customDir), { recursive: true, mode: 0o700 });
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.normalize(customDir)),
      expect.any(String),
    );
  });
});
