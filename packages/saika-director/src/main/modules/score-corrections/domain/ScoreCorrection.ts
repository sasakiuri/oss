// SPDX-License-Identifier: MIT
import type { ResultScope } from '@/shared/ipc/contracts';
import type { CorrectableShot, ScoreCorrectionBasis } from '@/main/modules/results';

export interface ScoreCorrectionChange {
  readonly operation: 'REPLACE' | 'INSERT_MISSING';
  readonly shotIndex: number;
  readonly scoreX10: number;
  readonly decimalScore: number | null;
  readonly innerTen: boolean | null;
  readonly sourceShotId: string | null;
  readonly evidenceReference: string;
}
export interface ScoreCorrectionRequest {
  readonly resultId: string;
  readonly resultScope: ResultScope;
  readonly caseId: string;
  readonly decisionId: string;
  readonly changes: readonly ScoreCorrectionChange[];
  readonly officialName: string;
  readonly statement: string;
}
export interface ScoreCorrectionPreview {
  readonly request: ScoreCorrectionRequest;
  readonly basis: ScoreCorrectionBasis;
  readonly caseRevision: string;
  readonly shots: readonly CorrectableShot[];
  readonly digest: string;
}
export interface ScoreCorrectionApplication extends ScoreCorrectionPreview {
  readonly id: string;
  readonly recordedAt: string;
}
export interface ScoreCorrectionWithdrawal {
  readonly id: string;
  readonly applicationId: string;
  readonly officialName: string;
  readonly statement: string;
  readonly recordedAt: string;
}
export interface IScoreCorrectionRepository {
  transaction<T>(operation: () => T): T;
  find(id: string): ScoreCorrectionApplication | null;
  list(
    target: Pick<ScoreCorrectionBasis, 'eventId' | 'participantId' | 'relayNumber' | 'resultScope'>,
  ): readonly ScoreCorrectionApplication[];
  append(value: ScoreCorrectionApplication): void;
  withdrawal(applicationId: string): ScoreCorrectionWithdrawal | null;
  withdraw(value: ScoreCorrectionWithdrawal): void;
}
export interface IScoreCorrectionTargetSource {
  resolve(
    resultId: string,
    resultScope: ScoreCorrectionRequest['resultScope'],
  ): { basis: ScoreCorrectionBasis; scoring: 'RING' | 'DECIMAL' | 'HIT_MISS' };
}
export interface ScoreCorrectionCaseOption {
  readonly id: string;
  readonly summary: string;
  readonly decisionId: string;
  readonly decision: string;
}
export interface IScoreCorrectionCaseSource {
  validate?(request: ScoreCorrectionRequest, basis: ScoreCorrectionBasis): void;
  list(basis: ScoreCorrectionBasis): readonly ScoreCorrectionCaseOption[];
  revision(caseId: string, decisionId: string, basis: ScoreCorrectionBasis): string;
}

export type ScoreCorrectionScoring = ReturnType<IScoreCorrectionTargetSource['resolve']>['scoring'];

/**
 * Applies the correction instructions to a copy of the source shots, checking each against the event scoring
 * mode. Series indices are left for the caller to assign from the source layout.
 */
export function correctShots(
  source: readonly CorrectableShot[],
  changes: readonly ScoreCorrectionChange[],
  scoring: ScoreCorrectionScoring,
): CorrectableShot[] {
  if (!changes.length) throw new Error('At least one correction is required');
  const shots = structuredClone([...source]);
  const indices = new Set<number>();
  for (const change of changes) {
    if (!Number.isInteger(change.shotIndex) || !shots[change.shotIndex] || indices.has(change.shotIndex))
      throw new Error('Select distinct existing shot positions');
    indices.add(change.shotIndex);
    if (!change.evidenceReference.trim()) throw new Error('Every correction requires an evidence reference');
    if (
      !Number.isInteger(change.scoreX10) ||
      change.scoreX10 < 0 ||
      change.scoreX10 > (scoring === 'HIT_MISS' ? 10 : 109) ||
      (scoring !== 'DECIMAL' && change.scoreX10 % 10 !== 0)
    )
      throw new Error('The corrected score does not match the event scoring mode');
    if (
      change.decimalScore !== null &&
      (!Number.isFinite(change.decimalScore) ||
        change.decimalScore < 0 ||
        change.decimalScore > 10.9 ||
        Math.abs(change.decimalScore * 10 - Math.round(change.decimalScore * 10)) > 0.000001 ||
        (scoring === 'RING' && Math.floor(change.decimalScore) !== change.scoreX10 / 10) ||
        (scoring === 'DECIMAL' && Math.round(change.decimalScore * 10) !== change.scoreX10))
    )
      throw new Error('Independent decimal evidence conflicts with the corrected score');
    if (scoring === 'HIT_MISS' && (change.innerTen !== null || change.decimalScore !== null))
      throw new Error('Hit/miss result corrections must not invent decimal or inner-ten evidence');
    if (change.innerTen === true && Math.floor(change.scoreX10 / 10) !== 10)
      throw new Error('Only a ten may be classified as an inner ten');
    const replacement = {
      scoreX10: change.scoreX10,
      ranking: {
        shotId: change.sourceShotId,
        ringScore: Math.floor(change.scoreX10 / 10),
        decimalScore: change.decimalScore,
        ...(change.decimalScore !== null ? { decimalScoreSource: 'DEVICE' as const } : {}),
        innerTen: change.innerTen,
        seriesIndex: 0,
      },
    };
    if (change.operation !== 'INSERT_MISSING' && change.operation !== 'REPLACE')
      throw new Error('Unsupported correction operation');
    applyCorrectionChange(shots, change, replacement);
  }
  const linkedIds = shots.map((shot) => shot.ranking.shotId).filter((id) => id !== null);
  if (new Set(linkedIds).size !== linkedIds.length) throw new Error('A source shot cannot be counted twice');
  return shots;
}

/** Applies one instruction at its position: an insertion shifts the later positions and drops the last one. */
export function applyCorrectionChange<T>(
  positions: T[],
  change: Pick<ScoreCorrectionChange, 'operation' | 'shotIndex'>,
  value: T,
): void {
  if (change.operation === 'INSERT_MISSING') {
    positions.splice(change.shotIndex, 0, value);
    positions.pop();
  } else positions[change.shotIndex] = value;
}
