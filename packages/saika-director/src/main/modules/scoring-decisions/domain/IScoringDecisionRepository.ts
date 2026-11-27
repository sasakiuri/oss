import type { ResultScope } from '@/main/domain/resultScope';
import type { ScoringDecision } from './ScoringDecision';

export interface IScoringDecisionRepository {
  append(decision: ScoringDecision): void;
  findById(id: string): ScoringDecision | null;
  findByTarget(
    eventId: string,
    participantId: string,
    relayNumber: number,
    resultScope: ResultScope,
  ): ScoringDecision[];
  findByEventId(eventId: string, resultScope: ResultScope): ScoringDecision[];
}
