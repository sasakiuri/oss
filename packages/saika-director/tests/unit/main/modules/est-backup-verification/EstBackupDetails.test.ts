import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { backupRecordsDigest } from '@/main/modules/est-backup-sources';
import { compareEstBackup } from '@/main/modules/est-backup-verification/domain/EstBackupComparator';
import {
  CanonicalCsvEstBackupRecordParser,
  CanonicalJsonEstBackupRecordParser,
  EstBackupRecordParserRegistry,
} from '@/main/modules/est-backup-verification/domain/EstBackupRecordParser';

const official = [
  {
    key: '101',
    name: 'Athlete',
    rank: 1,
    totalScore: 30,
    interventionCount: 0,
    shotScores: [9, 10, 11],
    seriesScores: [19, 11],
  },
];
describe('EST backup score details', () => {
  it('detects swapped shots and series even when the total and rank match', () => {
    const [item] = compareEstBackup(official, [
      { key: '101', rank: 1, totalScore: 30, shotScores: [10, 9, 11], seriesScores: [11, 19] },
    ]);
    expect(item?.status).toBe('MISMATCH');
    expect(item?.detailChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'SHOTS',
          status: 'MISMATCH',
          values: [
            { position: 1, official: 9, backup: 10 },
            { position: 2, official: 10, backup: 9 },
            { position: 3, official: 11, backup: 11 },
          ],
        }),
      ]),
    );
  });
  it('requires complete detail only when requested and never claims absent official shots were checked', () => {
    const backup = [{ key: '101', totalScore: 30 }];
    expect(compareEstBackup(official, backup)[0]?.status).toBe('MATCH');
    expect(compareEstBackup(official, backup, 'BOTH')[0]?.status).toBe('MISMATCH');
    expect(compareEstBackup(official, [{ ...backup[0]!, shotScores: [9, 10] }])[0]?.detailChecks?.[1]).toMatchObject({
      status: 'MISMATCH',
      values: expect.arrayContaining([{ position: 3, official: 11, backup: null }]),
    });
    expect(
      compareEstBackup([{ ...official[0]!, shotScores: undefined }], [{ ...backup[0]!, shotScores: [9, 10, 11] }])[0]
        ?.detailChecks?.[1]?.status,
    ).toBe('UNAVAILABLE');
    expect(
      compareEstBackup(official, [{ ...backup[0]!, shotScores: [9, 10, 11], seriesScores: [19, 11] }], 'BOTH')[0]
        ?.status,
    ).toBe('MATCH');
  });
  it('retains ordered details through JSON and CSV imports and rejects corrupt arrays', () => {
    const registry = new EstBackupRecordParserRegistry([
      new CanonicalCsvEstBackupRecordParser(),
      new CanonicalJsonEstBackupRecordParser(),
    ]);
    const record = { key: '101', rank: null, totalScore: 30, shotScores: [9, 10, 11], seriesScores: [19, 11] };
    expect(registry.parse('backup.json', JSON.stringify([record])).records).toEqual([record]);
    expect(
      registry.parse('backup.csv', 'key,totalScore,shotScores,seriesScores\n101,30,"[9,10,11]","[19,11]"').records,
    ).toEqual([record]);
    expect(() => registry.parse('backup.json', JSON.stringify([{ ...record, shotScores: [9, null, 11] }]))).toThrow(
      'finite numbers',
    );
  });
  it('binds retained sources to the detail order and keeps historical aggregate digests stable', () => {
    const legacy = [{ key: '101', rank: null, totalScore: 30 }];
    expect(backupRecordsDigest(legacy)).toBe(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'));
    expect(backupRecordsDigest([{ ...legacy[0]!, shotScores: [9, 10, 11] }])).not.toBe(
      backupRecordsDigest([{ ...legacy[0]!, shotScores: [10, 9, 11] }]),
    );
  });
});
