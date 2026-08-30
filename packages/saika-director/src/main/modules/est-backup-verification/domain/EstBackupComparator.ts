export interface OfficialBackupSubject {
  key: string;
  name: string;
  rank: number;
  totalScore: number;
  interventionCount: number;
}
export interface BackupRecord {
  key: string;
  rank?: number | null;
  totalScore: number;
}
export interface BackupComparisonItem {
  key: string;
  name: string;
  officialRank: number | null;
  backupRank: number | null;
  officialTotalScore: number | null;
  backupTotalScore: number | null;
  status: 'MATCH' | 'MISMATCH' | 'MISSING' | 'EXTRA';
  interventionCount: number;
}

/** Pure comparison policy for the ISSF 6.14.8 top-list EST printout or independent-memory check. */
export function compareEstBackup(
  official: readonly OfficialBackupSubject[],
  backup: readonly BackupRecord[],
): BackupComparisonItem[] {
  const backupByKey = new Map<string, BackupRecord>();
  for (const record of backup) {
    const key = record.key.trim();
    if (!key) throw new Error('Every backup record requires a key');
    if (backupByKey.has(key)) throw new Error(`Duplicate backup key: ${key}`);
    if (!Number.isFinite(record.totalScore)) throw new Error(`Invalid backup total for ${key}`);
    backupByKey.set(key, { ...record, key });
  }
  const items = official.map((subject): BackupComparisonItem => {
    const record = backupByKey.get(subject.key);
    backupByKey.delete(subject.key);
    if (!record)
      return {
        key: subject.key,
        name: subject.name,
        officialRank: subject.rank,
        backupRank: null,
        officialTotalScore: subject.totalScore,
        backupTotalScore: null,
        status: 'MISSING',
        interventionCount: subject.interventionCount,
      };
    const scoreMatches = Math.abs(record.totalScore - subject.totalScore) < 0.000_001;
    const rankMatches = record.rank === undefined || record.rank === null || record.rank === subject.rank;
    return {
      key: subject.key,
      name: subject.name,
      officialRank: subject.rank,
      backupRank: record.rank ?? null,
      officialTotalScore: subject.totalScore,
      backupTotalScore: record.totalScore,
      status: scoreMatches && rankMatches ? 'MATCH' : 'MISMATCH',
      interventionCount: subject.interventionCount,
    };
  });
  for (const record of backupByKey.values())
    items.push({
      key: record.key,
      name: 'Backup-only record',
      officialRank: null,
      backupRank: record.rank ?? null,
      officialTotalScore: null,
      backupTotalScore: record.totalScore,
      status: 'EXTRA',
      interventionCount: 0,
    });
  return items;
}
