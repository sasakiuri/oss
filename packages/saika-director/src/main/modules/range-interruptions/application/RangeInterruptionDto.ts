// SPDX-License-Identifier: MIT
import type {
  QualificationRecoveryExecutionDto,
  QualificationRecoverySettlementDto,
  QualificationTimedTargetRecoveryDecisionDto,
  RangeInterruptionCaseDto,
  RangeInterruptionCommandBatchDto,
  RangeInterruptionEntryDto,
  RangeInterruptionScopeDto,
  TargetRecoveryAssessmentDto,
} from '@/shared/ipc/contracts';

import type { QualificationRecoveryExecutionRecord } from '../domain/QualificationRecoveryExecution';
import type { QualificationRecoverySettlementRecord } from '../domain/QualificationRecoverySettlement';
import type { QualificationTimedTargetRecoveryDecision } from '../domain/QualificationTimedTargetRecoveryDecision';
import type { RangeInterruptionCase } from '../domain/RangeInterruptionCase';
import type { RangeInterruptionCommandBatch } from '../domain/RangeInterruptionCommandBatch';
import { getRangeInterruptionState, type RangeInterruptionEntry } from '../domain/RangeInterruptionEntry';
import { recommendRangeInterruption } from '../domain/RangeInterruptionRecommendationPolicy';
import type { RangeInterruptionScopeLink } from '../domain/RangeInterruptionScopeLink';
import type { TargetRecoveryAssessment } from '../domain/TargetRecoveryAssessment';

// Maps the interruption ledger records to the IPC DTOs the renderer shows.

export function toRangeInterruptionCaseDto(
  interruption: RangeInterruptionCase,
  scopes: readonly RangeInterruptionScopeLink[],
  entries: readonly RangeInterruptionEntry[],
  targetRecoveryAssessments: readonly TargetRecoveryAssessment[],
  commandBatches: readonly RangeInterruptionCommandBatch[],
  qualificationDecisions: readonly QualificationTimedTargetRecoveryDecision[],
  qualificationExecutions: readonly QualificationRecoveryExecutionRecord[],
  qualificationSettlements: readonly QualificationRecoverySettlementRecord[],
): RangeInterruptionCaseDto {
  const state = getRangeInterruptionState(entries);
  const recommendation =
    state.endedEntry?.lostTimeSeconds === null || state.endedEntry === null
      ? null
      : recommendRangeInterruption(
          interruption,
          state.endedEntry.lostTimeSeconds,
          targetRecoveryAssessments.at(-1) ?? null,
        );
  const recommendationDto =
    recommendation?.type === 'QUALIFICATION_TIMED_TARGET'
      ? { ...recommendation, ruleReferences: [...recommendation.ruleReferences] }
      : recommendation;
  return {
    id: interruption.id,
    cause: interruption.cause,
    phase: interruption.phase,
    startedAt: interruption.startedAt.toISOString(),
    remainingSecondsAtStart: interruption.remainingSecondsAtStart,
    laneId: interruption.laneId,
    firingPointNumber: interruption.firingPointNumber,
    athleteName: interruption.athleteName,
    summary: interruption.summary,
    details: interruption.details,
    openedBy: interruption.openedBy,
    createdAt: interruption.createdAt.toISOString(),
    scopes: scopes.map(toScopeDto),
    entries: entries.map(toEntryDto),
    targetRecoveryAssessments: targetRecoveryAssessments.map(toTargetRecoveryAssessmentDto),
    commandBatches: commandBatches.map(toCommandBatchDto),
    qualificationTimedTargetContext: interruption.qualificationTimedTargetContext
      ? {
          competitionTypeId: interruption.qualificationTimedTargetContext.competitionTypeId,
          rulePack: interruption.qualificationTimedTargetContext.rulePack,
          stageId: interruption.qualificationTimedTargetContext.stageId,
          stageIndex: interruption.qualificationTimedTargetContext.stageIndex,
          seriesIndex: interruption.qualificationTimedTargetContext.seriesIndex,
          timedTargetProgramId: interruption.qualificationTimedTargetContext.timedTargetProgramId,
          seriesShotLimit: interruption.qualificationTimedTargetContext.seriesShotLimit,
          recordedShots: interruption.qualificationTimedTargetContext.recordedShots,
          seriesComplete: interruption.qualificationTimedTargetContext.seriesComplete,
          laneSnapshotCapturedAt: interruption.qualificationTimedTargetContext.laneSnapshotCapturedAt,
        }
      : null,
    qualificationTimedTargetRecoveryDecisions: qualificationDecisions.map(toQualificationRecoveryDecisionDto),
    qualificationRecoveryExecutions: qualificationExecutions.map(toQualificationRecoveryExecutionDto),
    qualificationRecoverySettlements: qualificationSettlements.map(toQualificationRecoverySettlementDto),
    status: state.status,
    dataHoldActive: state.dataHoldActive,
    recommendation: recommendationDto,
  };
}

function toQualificationRecoverySettlementDto(
  settlement: QualificationRecoverySettlementRecord,
): QualificationRecoverySettlementDto {
  return {
    settlementId: settlement.settlementId,
    caseId: settlement.caseId,
    decisionId: settlement.decisionId,
    competitionId: settlement.competitionId,
    laneId: settlement.laneId,
    treatment: settlement.treatment,
    stageIndex: settlement.stageIndex,
    seriesIndex: settlement.seriesIndex,
    expectedMatchProgramId: settlement.expectedMatchProgramId,
    expectedSeriesShotLimit: settlement.expectedSeriesShotLimit,
    expectedRecordedShots: settlement.expectedRecordedShots,
    decisionOfficialName: settlement.decisionOfficialName,
    decisionRuleReference: settlement.decisionRuleReference,
    decidedAt: settlement.decidedAt.toISOString(),
    appliedBy: settlement.appliedBy,
    statement: settlement.statement,
    appliedAt: settlement.appliedAt.toISOString(),
    requestedAt: settlement.requestedAt.toISOString(),
    status: settlement.status,
    events: settlement.events.map((event) => ({
      id: event.id,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
      recordedAt: event.recordedAt.toISOString(),
    })),
  };
}

function toQualificationRecoveryExecutionDto(
  execution: QualificationRecoveryExecutionRecord,
): QualificationRecoveryExecutionDto {
  return {
    runId: execution.runId,
    caseId: execution.caseId,
    decisionId: execution.decisionId,
    competitionId: execution.competitionId,
    laneId: execution.laneId,
    phase: execution.phase,
    stageIndex: execution.stageIndex,
    seriesIndex: execution.seriesIndex,
    expectedMatchProgramId: execution.expectedMatchProgramId,
    expectedSeriesShotLimit: execution.expectedSeriesShotLimit,
    expectedRecordedShots: execution.expectedRecordedShots,
    authorization: execution.authorization,
    officialName: execution.officialName,
    decisionRuleReference: execution.decisionRuleReference,
    decidedAt: execution.decidedAt.toISOString(),
    requestedAt: execution.requestedAt.toISOString(),
    status: execution.status,
    latestLaneState: execution.latestLaneState,
    shots: [...execution.shots],
    events: execution.events.map((event) => ({
      id: event.id,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
      recordedAt: event.recordedAt.toISOString(),
    })),
  };
}

function toQualificationRecoveryDecisionDto(
  decision: QualificationTimedTargetRecoveryDecision,
): QualificationTimedTargetRecoveryDecisionDto {
  return {
    id: decision.id,
    caseId: decision.caseId,
    supersedesDecisionId: decision.supersedesDecisionId,
    recommendation: { ...decision.recommendation, ruleReferences: [...decision.recommendation.ruleReferences] },
    authorizedRecovery: {
      extraSightingSeriesShots: decision.authorizedRecovery.extraSightingSeriesShots,
      ...(decision.authorizedRecovery.minimumPauseAfterSightingSeconds !== undefined
        ? { minimumPauseAfterSightingSeconds: decision.authorizedRecovery.minimumPauseAfterSightingSeconds }
        : {}),
      seriesRecovery: decision.authorizedRecovery.seriesRecovery,
    },
    followsRecommendation: decision.followsRecommendation,
    statement: decision.statement,
    officialName: decision.officialName,
    incidentReportReference: decision.incidentReportReference,
    ruleReference: decision.ruleReference,
    decidedAt: decision.decidedAt.toISOString(),
    recordedAt: decision.recordedAt.toISOString(),
  };
}

function toCommandBatchDto(batch: RangeInterruptionCommandBatch): RangeInterruptionCommandBatchDto {
  return {
    id: batch.id,
    caseId: batch.caseId,
    competitionId: batch.competitionId,
    operation: batch.operation,
    targetLaneIds: [...batch.targetLaneIds],
    success: batch.success,
    outcomes: batch.outcomes.map((outcome) => ({ ...outcome })),
    officialName: batch.officialName,
    occurredAt: batch.occurredAt.toISOString(),
    recordedAt: batch.recordedAt.toISOString(),
  };
}

function toTargetRecoveryAssessmentDto(assessment: TargetRecoveryAssessment): TargetRecoveryAssessmentDto {
  return {
    id: assessment.id,
    caseId: assessment.caseId,
    repairCompletedAt: assessment.repairCompletedAt?.toISOString() ?? null,
    movedToReserveFiringPoint: assessment.movedToReserveFiringPoint,
    reserveFiringPointNumber: assessment.reserveFiringPointNumber,
    statement: assessment.statement,
    officialName: assessment.officialName,
    assessedAt: assessment.assessedAt.toISOString(),
  };
}

function toScopeDto(scope: RangeInterruptionScopeLink): RangeInterruptionScopeDto {
  return {
    id: scope.id,
    caseId: scope.caseId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    linkedBy: scope.linkedBy,
    note: scope.note,
    linkedAt: scope.linkedAt.toISOString(),
  };
}

function toEntryDto(entry: RangeInterruptionEntry): RangeInterruptionEntryDto {
  return {
    id: entry.id,
    caseId: entry.caseId,
    type: entry.type,
    occurredAt: entry.occurredAt.toISOString(),
    statement: entry.statement,
    officialName: entry.officialName,
    ruleReference: entry.ruleReference,
    lostTimeSeconds: entry.lostTimeSeconds,
    extensionSeconds: entry.extensionSeconds,
    authorizedRemainingSeconds: entry.authorizedRemainingSeconds,
    unlimitedSightingShots: entry.unlimitedSightingShots,
    incidentReportReference: entry.incidentReportReference,
    commandId: entry.commandId,
    recordedAt: entry.recordedAt.toISOString(),
  };
}
