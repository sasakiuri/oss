import { requiredText } from '@/main/domain/guards';
import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';
import type { CreateRangeInterruptionCasePayload } from '@/shared/ipc/contracts';
import {
  recommendQualificationTimedTargetInterruption,
  type QualificationTimedTargetRecoveryCapability,
} from '@sasakiuri/saika-rules';

export interface QualificationTimedTargetRulePackSnapshot {
  readonly id: string;
  readonly schemaVersion: number;
  readonly fingerprintSha256: string;
}

export interface QualificationTimedTargetInterruptionContext {
  readonly competitionTypeId: string;
  readonly rulePack: QualificationTimedTargetRulePackSnapshot | null;
  readonly stageId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly timedTargetProgramId: string;
  readonly seriesShotLimit: number;
  readonly recordedShots: number;
  readonly seriesComplete: boolean;
  readonly laneSnapshotCapturedAt: string;
  /** Immutable copy used so later registry changes cannot rewrite the original recommendation. */
  readonly recoveryCapability: QualificationTimedTargetRecoveryCapability;
}

type RequestedQualificationTimedTargetContext = NonNullable<
  CreateRangeInterruptionCasePayload['qualificationTimedTargetContext']
>;

/** Throws unless the interruption qualifies for ISSF 8.8.1 Qualification series recovery. */
export function assertQualificationSeriesRecoveryApplies(
  interruption: Pick<CreateRangeInterruptionCasePayload, 'cause' | 'phase' | 'laneId'>,
): void {
  if (!['ATHLETE_NON_FAULT', 'ALL_TARGET_FAILURE', 'SINGLE_TARGET_FAILURE'].includes(interruption.cause)) {
    throw new Error('ISSF 8.8.1 Qualification recovery applies only to a safety or technical interruption');
  }
  if (interruption.phase !== 'MATCH') {
    throw new Error('Qualification series recovery requires a MATCH interruption');
  }
  if (!interruption.laneId) throw new Error('Qualification series recovery requires an affected Lane');
}

/** Captures the requested series and the competition type's recovery policy for a Qualification interruption. */
export function qualificationTimedTargetContextFor(
  definition: CompetitionTypeDefinition,
  requested: RequestedQualificationTimedTargetContext,
): QualificationTimedTargetInterruptionContext {
  const recovery = definition.timedTarget?.recovery;
  if (recovery?.procedure !== 'QUALIFICATION') {
    throw new Error(`Competition type ${definition.id} has no Qualification timed-target recovery policy`);
  }
  const stage = definition.config.stages[requested.stageIndex];
  if (!stage || stage.type !== 'match' || !stage.id) {
    throw new Error(`Competition type ${definition.id} has no MATCH stage ${requested.stageIndex}`);
  }
  const series = stage.series[requested.seriesIndex];
  if (!series?.timedTargetProgramId || series.shots <= 0) {
    throw new Error(
      `Competition type ${definition.id} has no timed series at ${requested.stageIndex}:${requested.seriesIndex}`,
    );
  }
  const identity = definition.rulePackIdentity;
  return createQualificationTimedTargetInterruptionContext({
    competitionTypeId: definition.id,
    rulePack: identity
      ? {
          id: identity.id,
          schemaVersion: identity.schemaVersion,
          fingerprintSha256: identity.fingerprint.value,
        }
      : null,
    stageId: stage.id,
    stageIndex: requested.stageIndex,
    seriesIndex: requested.seriesIndex,
    timedTargetProgramId: series.timedTargetProgramId,
    seriesShotLimit: series.shots,
    recordedShots: requested.recordedShots,
    seriesComplete: requested.seriesComplete,
    laneSnapshotCapturedAt: requested.laneSnapshotCapturedAt,
    recoveryCapability: recovery,
  });
}

export function createQualificationTimedTargetInterruptionContext(
  input: QualificationTimedTargetInterruptionContext,
): QualificationTimedTargetInterruptionContext {
  const value = clone(input);
  requiredText(value.competitionTypeId, 'competitionTypeId');
  requiredText(value.stageId, 'stageId');
  nonNegativeInteger(value.stageIndex, 'stageIndex');
  nonNegativeInteger(value.seriesIndex, 'seriesIndex');
  requiredText(value.timedTargetProgramId, 'timedTargetProgramId');
  positiveInteger(value.seriesShotLimit, 'seriesShotLimit');
  nonNegativeInteger(value.recordedShots, 'recordedShots');
  if (value.recordedShots > value.seriesShotLimit) throw new Error('recordedShots must not exceed seriesShotLimit');
  if (value.seriesComplete && value.recordedShots !== value.seriesShotLimit) {
    throw new Error('A completed series must contain its full recorded shot count');
  }
  if (!Number.isFinite(Date.parse(value.laneSnapshotCapturedAt))) {
    throw new Error('laneSnapshotCapturedAt must be a valid ISO date');
  }
  if (value.rulePack) {
    requiredText(value.rulePack.id, 'rulePack.id');
    positiveInteger(value.rulePack.schemaVersion, 'rulePack.schemaVersion');
    if (!/^[a-f0-9]{64}$/.test(value.rulePack.fingerprintSha256)) {
      throw new Error('rulePack.fingerprintSha256 must be a lowercase SHA-256 value');
    }
  }
  if (value.recoveryCapability.procedure !== 'QUALIFICATION') {
    throw new Error('A Qualification timed-target context requires a Qualification recovery capability');
  }
  // Exercises both the stage lookup and the captured series facts at the boundary.
  recommendQualificationTimedTargetInterruption(value.recoveryCapability, {
    stageId: value.stageId,
    interruptionSeconds: 0,
    seriesShotLimit: value.seriesShotLimit,
    recordedShots: value.recordedShots,
    seriesComplete: value.seriesComplete,
  });
  return deepFreeze(value);
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

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}
