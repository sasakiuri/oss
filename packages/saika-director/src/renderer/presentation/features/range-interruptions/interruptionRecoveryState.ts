// SPDX-License-Identifier: MIT
import type { RangeInterruptionCaseDto, QualificationTimedTargetRecoveryDecisionDto } from '@/shared/ipc/contracts';

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
  return interruption.commandBatches?.at(0)?.targetLaneIds ?? lanes.map((lane) => lane.laneId);
}

export function pendingRangeLaneIds(
  interruption: RangeInterruptionCaseDto,
  operation: 'PAUSE' | 'RESUME' | 'MATCH_RESUME',
  targetLaneIds: readonly string[],
): string[] {
  const latest = new Map<string, 'done' | 'error' | 'timeout'>();
  for (const batch of interruption.commandBatches ?? []) {
    if (batch.operation !== operation || !sameLaneSet(batch.targetLaneIds, targetLaneIds)) continue;
    for (const outcome of batch.outcomes) latest.set(outcome.laneId, outcome.status);
  }
  return targetLaneIds.filter((laneId) => latest.get(laneId) !== 'done');
}

export function rangeBatchRecoveryComplete(interruption: RangeInterruptionCaseDto): boolean {
  const batches = interruption.commandBatches ?? [];
  return batches.every((batch) => pendingRangeLaneIds(interruption, batch.operation, batch.targetLaneIds).length === 0);
}

function sameLaneSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((laneId) => b.includes(laneId));
}
