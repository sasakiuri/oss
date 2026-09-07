// SPDX-License-Identifier: MIT
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
  readonly resultScope: 'QUALIFICATION' | 'FINAL';
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
