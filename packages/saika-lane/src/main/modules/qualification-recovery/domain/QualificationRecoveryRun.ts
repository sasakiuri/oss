// SPDX-License-Identifier: MIT
import type { QualificationRecoveryFiringAuthorization } from './QualificationRecoveryProgram';

export const QUALIFICATION_RECOVERY_ACQUISITION_OWNER = 'qualification-recovery';

export type QualificationRecoveryRunStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export interface StartQualificationRecoveryRunInput {
  readonly runId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly competitionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly authorization: QualificationRecoveryFiringAuthorization;
  readonly loadAt: Date;
  readonly officialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: Date;
}

export interface QualificationRecoveryRunStart extends StartQualificationRecoveryRunInput {
  readonly sequenceId: string;
  readonly executionProgramId: string;
  readonly targetProfileId: string;
  readonly startedAt: Date;
}

export interface QualificationRecoveryRecordedShot {
  readonly shotId: string;
  readonly observationId: string | null;
  readonly firedAt: Date;
  readonly recordedAt: Date;
}

export interface QualificationRecoveryRunRecord extends QualificationRecoveryRunStart {
  readonly status: QualificationRecoveryRunStatus;
  readonly terminalReason: string | null;
  readonly terminalAt: Date | null;
  readonly shots: readonly QualificationRecoveryRecordedShot[];
}

export function createQualificationRecoveryRunStart(
  input: QualificationRecoveryRunStart,
): QualificationRecoveryRunStart {
  const expectedSeriesShotLimit = positiveInteger(input.expectedSeriesShotLimit, 'expectedSeriesShotLimit');
  const expectedRecordedShots = nonNegativeInteger(input.expectedRecordedShots, 'expectedRecordedShots');
  if (expectedRecordedShots > expectedSeriesShotLimit) {
    throw new Error('expectedRecordedShots must not exceed expectedSeriesShotLimit');
  }
  return Object.freeze({
    runId: requiredText(input.runId, 'runId'),
    decisionId: requiredText(input.decisionId, 'decisionId'),
    interruptionId: requiredText(input.interruptionId, 'interruptionId'),
    competitionId: requiredText(input.competitionId, 'competitionId'),
    stageIndex: nonNegativeInteger(input.stageIndex, 'stageIndex'),
    seriesIndex: nonNegativeInteger(input.seriesIndex, 'seriesIndex'),
    expectedMatchProgramId: requiredText(input.expectedMatchProgramId, 'expectedMatchProgramId'),
    expectedSeriesShotLimit,
    expectedRecordedShots,
    authorization: deepFreeze(clone(input.authorization)),
    loadAt: validDate(input.loadAt, 'loadAt'),
    officialName: requiredText(input.officialName, 'officialName'),
    decisionRuleReference: requiredText(input.decisionRuleReference, 'decisionRuleReference'),
    decidedAt: validDate(input.decidedAt, 'decidedAt'),
    sequenceId: requiredText(input.sequenceId, 'sequenceId'),
    executionProgramId: requiredText(input.executionProgramId, 'executionProgramId'),
    targetProfileId: requiredText(input.targetProfileId, 'targetProfileId'),
    startedAt: validDate(input.startedAt, 'startedAt'),
  });
}

export function qualificationRecoveryRequestMatches(
  record: QualificationRecoveryRunRecord,
  input: StartQualificationRecoveryRunInput,
): boolean {
  return (
    record.runId === input.runId.trim() &&
    record.decisionId === input.decisionId.trim() &&
    record.interruptionId === input.interruptionId.trim() &&
    record.competitionId === input.competitionId.trim() &&
    record.stageIndex === input.stageIndex &&
    record.seriesIndex === input.seriesIndex &&
    record.expectedMatchProgramId === input.expectedMatchProgramId.trim() &&
    record.expectedSeriesShotLimit === input.expectedSeriesShotLimit &&
    record.expectedRecordedShots === input.expectedRecordedShots &&
    record.loadAt.getTime() === input.loadAt.getTime() &&
    record.officialName === input.officialName.trim() &&
    record.decisionRuleReference === input.decisionRuleReference.trim() &&
    record.decidedAt.getTime() === input.decidedAt.getTime() &&
    JSON.stringify(record.authorization) === JSON.stringify(input.authorization)
  );
}

export function freezeQualificationRecoveryRunRecord(
  input: QualificationRecoveryRunRecord,
): QualificationRecoveryRunRecord {
  return Object.freeze({
    ...createQualificationRecoveryRunStart(input),
    status: input.status,
    terminalReason: input.terminalReason,
    terminalAt: input.terminalAt ? validDate(input.terminalAt, 'terminalAt') : null,
    shots: Object.freeze(
      input.shots.map((shot) =>
        Object.freeze({
          shotId: requiredText(shot.shotId, 'shotId'),
          observationId: shot.observationId ? requiredText(shot.observationId, 'observationId') : null,
          firedAt: validDate(shot.firedAt, 'firedAt'),
          recordedAt: validDate(shot.recordedAt, 'recordedAt'),
        }),
      ),
    ),
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be a valid date`);
  return new Date(value.getTime());
}
