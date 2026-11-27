// SPDX-License-Identifier: MIT
import type {
  QualificationRecoveryExecutionDto,
  QualificationTimedTargetRecoveryDecisionDto,
  RangeInterruptionCaseDto,
} from '@/shared/ipc/contracts';

import { type RangeInterruptionLaneOption } from './interruptionPresentationTypes';

export function qualificationSeriesRecoveryComplete(
  interruption: RangeInterruptionCaseDto,
  decision: QualificationTimedTargetRecoveryDecisionDto | null,
): boolean {
  if (!interruption.qualificationTimedTargetContext) return true;
  if (!decision) return false;
  const recovery = decision.authorizedRecovery.seriesRecovery;
  if (recovery.treatment === 'KEEP_RECORDED_SERIES') {
    return interruption.qualificationRecoverySettlements.some(
      (settlement) => settlement.decisionId === decision.id && settlement.status === 'APPLIED',
    );
  }
  return interruption.qualificationRecoveryExecutions.some(
    (execution) =>
      execution.decisionId === decision.id &&
      execution.phase === 'SERIES_RECOVERY' &&
      execution.status === 'ADJUDICATED',
  );
}

export function blocksQualificationDecisionSupersession(
  execution: RangeInterruptionCaseDto['qualificationRecoveryExecutions'][number],
): boolean {
  if (execution.status === 'CANCELLED') return false;
  return execution.phase !== 'EXTRA_SIGHTING' || execution.status !== 'COMPLETED';
}

export function rangeTargetLaneIds(
  interruption: RangeInterruptionCaseDto,
  lanes: readonly RangeInterruptionLaneOption[],
): string[] {
  return interruption.commandBatches.at(0)?.targetLaneIds ?? lanes.map((lane) => lane.laneId);
}

export function pendingRangeLaneIds(
  interruption: RangeInterruptionCaseDto,
  operation: 'PAUSE' | 'RESUME' | 'MATCH_RESUME',
  targetLaneIds: readonly string[],
): string[] {
  const latest = new Map<string, 'done' | 'error' | 'timeout'>();
  for (const batch of interruption.commandBatches) {
    if (batch.operation !== operation || !sameLaneSet(batch.targetLaneIds, targetLaneIds)) continue;
    for (const outcome of batch.outcomes) latest.set(outcome.laneId, outcome.status);
  }
  return targetLaneIds.filter((laneId) => latest.get(laneId) !== 'done');
}

export function rangeBatchRecoveryComplete(interruption: RangeInterruptionCaseDto): boolean {
  return interruption.commandBatches.every(
    (batch) => pendingRangeLaneIds(interruption, batch.operation, batch.targetLaneIds).length === 0,
  );
}

function sameLaneSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((laneId) => b.includes(laneId));
}

/** The official and statement of a score application that was already requested for a recovery run. */
export interface RecoveryAdjudicationRequest {
  appliedBy: string;
  statement: string;
}

export function cancellableRecoveryRun(
  execution: QualificationRecoveryExecutionDto | null,
): execution is QualificationRecoveryExecutionDto {
  return Boolean(execution && ['ACCEPTED', 'RUNNING', 'CANCELLING'].includes(execution.status));
}

export function retryableRecoveryStart(status: QualificationRecoveryExecutionDto['status']): boolean {
  return status === 'REQUESTED' || status === 'COMMAND_FAILED';
}

export function canAdjudicateRecoveryRun(
  execution: QualificationRecoveryExecutionDto | null,
): execution is QualificationRecoveryExecutionDto {
  return Boolean(execution && ['COMPLETED', 'ADJUDICATING', 'ADJUDICATION_FAILED'].includes(execution.status));
}

export function activeRecoveryFiring(status: QualificationRecoveryExecutionDto['status'] | undefined): boolean {
  return Boolean(status && ['REQUESTED', 'ACCEPTED', 'RUNNING', 'CANCELLING'].includes(status));
}

export function recoveryAdjudicationRequest(
  execution: QualificationRecoveryExecutionDto,
): RecoveryAdjudicationRequest | null {
  const event = execution.events.find((candidate) => candidate.type === 'ADJUDICATION_REQUESTED');
  const value = event?.payload.adjudication;
  if (!value || typeof value !== 'object') return null;
  const appliedBy = Reflect.get(value, 'appliedBy');
  const statement = Reflect.get(value, 'statement');
  return typeof appliedBy === 'string' && typeof statement === 'string' ? { appliedBy, statement } : null;
}

export function authorizedRecoveryShots(execution: QualificationRecoveryExecutionDto): number {
  return execution.authorization.phase === 'EXTRA_SIGHTING'
    ? execution.authorization.shotsToFire
    : execution.authorization.seriesRecovery.shotsToFire;
}
