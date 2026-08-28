import type { ScoringDecisionTarget, ScoringResultScope } from './ScoringDecision';

export interface ScoringDecisionTargetSnapshot extends ScoringDecisionTarget {
  readonly seriesShotCounts: readonly number[];
}

/** Port used by the decision ledger to resolve a mutable result record into a stable target. */
export interface IScoringDecisionTargetResolver {
  resolve(resultId: string, resultScope: ScoringResultScope): Promise<ScoringDecisionTargetSnapshot | null>;
}
