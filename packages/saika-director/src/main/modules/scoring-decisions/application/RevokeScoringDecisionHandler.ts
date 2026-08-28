import type { RevokeScoringDecisionPayload, ScoringDecisionDto } from '@/shared/ipc/contracts';
import type { IScoringDecisionRepository } from '../domain/IScoringDecisionRepository';
import { ScoringDecision, getActiveScoringDecisions } from '../domain/ScoringDecision';
import { toScoringDecisionDto } from './toScoringDecisionDto';

export class RevokeScoringDecisionHandler {
  constructor(private readonly decisions: IScoringDecisionRepository) {}

  execute(input: RevokeScoringDecisionPayload): ScoringDecisionDto {
    const target = this.decisions.findById(input.decisionId);
    if (!target) throw new Error(`Decision ${input.decisionId} was not found`);
    if (target.type === 'REVOCATION') throw new Error('A revocation cannot be revoked; append a new decision instead');

    const history = this.decisions.findByTarget(
      target.eventId,
      target.participantId,
      target.relayNumber,
      target.resultScope,
    );
    if (!getActiveScoringDecisions(history).some((decision) => decision.id === target.id)) {
      throw new Error(`Decision ${input.decisionId} is already revoked`);
    }

    const revocation = ScoringDecision.createRevocation({
      eventId: target.eventId,
      participantId: target.participantId,
      relayNumber: target.relayNumber,
      resultScope: target.resultScope,
      resultIdAtDecision: target.resultIdAtDecision,
      sourceCompetitionId: target.sourceCompetitionId,
      reversesDecisionId: target.id,
      ruleReference: input.ruleReference,
      incidentReportNumber: input.incidentReportNumber,
      reason: input.reason,
      internalNote: input.internalNote,
      officialName: input.officialName,
    });
    this.decisions.append(revocation);
    return toScoringDecisionDto(revocation, false);
  }
}
