export interface BackupResultBinding {
  resultId: string;
  participantId: string;
  resultRevision: string;
}
export interface BackupScoreDetails {
  shotScores?: number[];
  seriesScores?: number[];
}
export type BackupDetailRequirement = 'AVAILABLE' | 'SERIES' | 'SHOTS' | 'BOTH';
export interface BackupDetailCheck {
  kind: 'SERIES' | 'SHOTS';
  required: boolean;
  status: 'MATCH' | 'MISMATCH' | 'MISSING' | 'UNAVAILABLE' | 'NOT_REQUESTED';
  values: { position: number; official: number | null; backup: number | null }[];
}
export interface OfficialBackupSubject extends BackupScoreDetails {
  resultBinding?: BackupResultBinding;
  key: string;
  name: string;
  rank: number;
  totalScore: number;
  interventionCount: number;
}
export interface BackupRecord extends BackupScoreDetails {
  key: string;
  rank?: number | null;
  totalScore: number;
}
export interface BackupComparisonItem {
  detailChecks?: BackupDetailCheck[];
  resultBinding?: BackupResultBinding;
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
  requirement: BackupDetailRequirement = 'AVAILABLE',
): BackupComparisonItem[] {
  if (!['AVAILABLE', 'SERIES', 'SHOTS', 'BOTH'].includes(requirement)) throw new Error('Unknown detail requirement');
  const backupByKey = new Map<string, BackupRecord>();
  for (const record of backup) {
    const key = record.key.trim();
    if (!key) throw new Error('Every backup record requires a key');
    if (backupByKey.has(key)) throw new Error(`Duplicate backup key: ${key}`);
    if (!Number.isFinite(record.totalScore)) throw new Error(`Invalid backup total for ${key}`);
    backupByKey.set(key, { ...record, key });
  }
  if (new Set(official.map((subject) => subject.key)).size !== official.length)
    throw new Error('Official comparison keys must be unique');
  const items = official.map((subject): BackupComparisonItem => {
    const record = backupByKey.get(subject.key);
    backupByKey.delete(subject.key);
    if (!record)
      return {
        ...(subject.resultBinding ? { resultBinding: subject.resultBinding } : {}),
        key: subject.key,
        name: subject.name,
        officialRank: subject.rank,
        backupRank: null,
        officialTotalScore: subject.totalScore,
        backupTotalScore: null,
        detailChecks: compareDetails(subject, {}, requirement),
        status: 'MISSING',
        interventionCount: subject.interventionCount,
      };
    const detailChecks = compareDetails(subject, record, requirement);
    const detailsMatch = detailChecks.every((check) => check.status === 'MATCH' || check.status === 'NOT_REQUESTED');
    const scoreMatches = Math.abs(record.totalScore - subject.totalScore) < 0.000_001;
    const rankMatches = record.rank === undefined || record.rank === null || record.rank === subject.rank;
    return {
      ...(subject.resultBinding ? { resultBinding: subject.resultBinding } : {}),
      key: subject.key,
      name: subject.name,
      officialRank: subject.rank,
      backupRank: record.rank ?? null,
      officialTotalScore: subject.totalScore,
      backupTotalScore: record.totalScore,
      detailChecks,
      status: scoreMatches && rankMatches && detailsMatch ? 'MATCH' : 'MISMATCH',
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

function compareDetails(
  official: BackupScoreDetails,
  backup: BackupScoreDetails,
  requirement: BackupDetailRequirement,
): BackupDetailCheck[] {
  return (['SERIES', 'SHOTS'] as const).map((kind) => {
    const key = kind === 'SERIES' ? 'seriesScores' : 'shotScores';
    const left = official[key];
    const right = backup[key];
    for (const scores of [left, right]) {
      if (
        scores !== undefined &&
        (!Array.isArray(scores) || scores.length > 1000 || scores.some((score) => !Number.isFinite(score)))
      )
        throw new Error(`Invalid ${key}`);
    }
    const required = requirement === kind || requirement === 'BOTH';
    if (!required && right === undefined) return { kind, required, status: 'NOT_REQUESTED', values: [] };
    const values = Array.from({ length: Math.max(left?.length ?? 0, right?.length ?? 0) }, (_, index) => ({
      position: index + 1,
      official: left?.[index] ?? null,
      backup: right?.[index] ?? null,
    }));
    const status = !left?.length
      ? 'UNAVAILABLE'
      : !right?.length
        ? 'MISSING'
        : values.every(
              (value) =>
                value.official !== null && value.backup !== null && Math.abs(value.official - value.backup) < 0.000_001,
            )
          ? 'MATCH'
          : 'MISMATCH';
    return { kind, required, status, values };
  });
}
