import type { ScoringDecisionDto } from '@/shared/ipc/contracts/scoringDecisions.contract';
import { getActiveScoringDecisions, type ScoringDecision } from '../domain/ScoringDecision';

export function toScoringDecisionDtos(history: readonly ScoringDecision[]): ScoringDecisionDto[] {
  const activeIds = new Set(getActiveScoringDecisions(history).map((decision) => decision.id));
  return history.map((decision) => toScoringDecisionDto(decision, activeIds.has(decision.id)));
}

export function toScoringDecisionDto(decision: ScoringDecision, active: boolean): ScoringDecisionDto {
  return {
    id: decision.id,
    eventId: decision.eventId,
    participantId: decision.participantId,
    relayNumber: decision.relayNumber,
    resultScope: decision.resultScope,
    resultIdAtDecision: decision.resultIdAtDecision,
    sourceCompetitionId: decision.sourceCompetitionId,
    type: decision.type,
    applicationPolicy: decision.applicationPolicy,
    pointsX10: decision.pointsX10,
    seriesIndex: decision.seriesIndex,
    shotIndex: decision.shotIndex,
    classificationCode: decision.classificationCode,
    ruleReference: decision.ruleReference,
    incidentReportNumber: decision.incidentReportNumber,
    publicRemark: decision.publicRemark,
    internalNote: decision.internalNote,
    officialName: decision.officialName,
    decidedAt: decision.decidedAt.toISOString(),
    reversesDecisionId: decision.reversesDecisionId,
    active,
  };
}
