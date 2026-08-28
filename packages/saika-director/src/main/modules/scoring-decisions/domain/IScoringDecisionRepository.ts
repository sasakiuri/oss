import type { ScoringDecision, ScoringResultScope } from './ScoringDecision';

export interface IScoringDecisionRepository {
  append(decision: ScoringDecision): void;
  findById(id: string): ScoringDecision | null;
  findByTarget(
    eventId: string,
    participantId: string,
    relayNumber: number,
    resultScope: ScoringResultScope,
  ): ScoringDecision[];
  findByEventId(eventId: string, resultScope: ScoringResultScope): ScoringDecision[];
}
