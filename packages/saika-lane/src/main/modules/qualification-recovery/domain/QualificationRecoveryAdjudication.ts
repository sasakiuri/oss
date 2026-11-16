// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';
import { nonNegativeInteger, positiveInteger, requiredText, validDate } from '@/shared/validation';

export type QualificationRecoveryAdjudicationTreatment = 'ANNUL_AND_REPEAT' | 'COMPLETE_REMAINING_SHOTS';

export type QualificationRecoveryAdjudicationShotDisposition =
  'PRESERVED_ORIGINAL' | 'ANNULLED_ORIGINAL' | 'CREDITED_RECOVERY' | 'CREDITED_MISS';

export interface QualificationRecoveryAdjudicationShot {
  readonly disposition: QualificationRecoveryAdjudicationShotDisposition;
  readonly shot: Shot;
}

export interface QualificationRecoveryAdjudicationRecord {
  readonly id: string;
  readonly runId: string;
  readonly competitionId: string;
  readonly sessionId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly treatment: QualificationRecoveryAdjudicationTreatment;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly sessionSeriesNumber: number;
  readonly expectedRecordedShots: number;
  readonly authorizedShots: number;
  readonly decisionOfficialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: Date;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: Date;
  readonly shots: readonly QualificationRecoveryAdjudicationShot[];
}

export function createQualificationRecoveryAdjudication(
  input: QualificationRecoveryAdjudicationRecord,
): QualificationRecoveryAdjudicationRecord {
  const expectedRecordedShots = nonNegativeInteger(input.expectedRecordedShots, 'expectedRecordedShots');
  const authorizedShots = positiveInteger(input.authorizedShots, 'authorizedShots');
  const shots = input.shots.map((entry) => Object.freeze({ disposition: entry.disposition, shot: entry.shot }));
  const originalDisposition = input.treatment === 'ANNUL_AND_REPEAT' ? 'ANNULLED_ORIGINAL' : 'PRESERVED_ORIGINAL';
  const originals = shots.filter((entry) => entry.disposition === originalDisposition);
  const credited = shots.filter(
    (entry) => entry.disposition === 'CREDITED_RECOVERY' || entry.disposition === 'CREDITED_MISS',
  );
  const invalidOriginal = shots.some(
    (entry) =>
      entry.disposition === (input.treatment === 'ANNUL_AND_REPEAT' ? 'PRESERVED_ORIGINAL' : 'ANNULLED_ORIGINAL'),
  );

  if (invalidOriginal || originals.length !== expectedRecordedShots) {
    throw new Error('Adjudication original-shot evidence does not match the authorized treatment');
  }
  if (credited.length !== authorizedShots) {
    throw new Error('Adjudication must credit every authorized recovery slot');
  }
  if (new Set(shots.map((entry) => entry.shot.id)).size !== shots.length) {
    throw new Error('Adjudication shot IDs must be unique');
  }

  return Object.freeze({
    id: requiredText(input.id, 'id'),
    runId: requiredText(input.runId, 'runId'),
    competitionId: requiredText(input.competitionId, 'competitionId'),
    sessionId: requiredText(input.sessionId, 'sessionId'),
    decisionId: requiredText(input.decisionId, 'decisionId'),
    interruptionId: requiredText(input.interruptionId, 'interruptionId'),
    treatment: input.treatment,
    stageIndex: nonNegativeInteger(input.stageIndex, 'stageIndex'),
    seriesIndex: nonNegativeInteger(input.seriesIndex, 'seriesIndex'),
    sessionSeriesNumber: positiveInteger(input.sessionSeriesNumber, 'sessionSeriesNumber'),
    expectedRecordedShots,
    authorizedShots,
    decisionOfficialName: requiredText(input.decisionOfficialName, 'decisionOfficialName'),
    decisionRuleReference: requiredText(input.decisionRuleReference, 'decisionRuleReference'),
    decidedAt: validDate(input.decidedAt, 'decidedAt'),
    appliedBy: requiredText(input.appliedBy, 'appliedBy'),
    statement: requiredText(input.statement, 'statement'),
    appliedAt: validDate(input.appliedAt, 'appliedAt'),
    shots: Object.freeze(shots),
  });
}

export function qualificationRecoveryAdjudicationRequestMatches(
  record: QualificationRecoveryAdjudicationRecord,
  request: { appliedBy: string; statement: string; appliedAt: Date },
): boolean {
  return (
    record.appliedBy === request.appliedBy.trim() &&
    record.statement === request.statement.trim() &&
    record.appliedAt.getTime() === request.appliedAt.getTime()
  );
}
