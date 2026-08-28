export { scoringDecisionsModule } from './scoringDecisions.module';
export { ScoringDecisionProjector } from './domain/ScoringDecisionProjector';
export { getActiveScoringDecisions } from './domain/ScoringDecision';
export { SqliteScoringDecisionRepository } from './infra/SqliteScoringDecisionRepository';
export type { ScoreDecisionProjection } from './domain/ScoringDecisionProjector';
export type { ScoringDecision, ScoringResultScope } from './domain/ScoringDecision';
export type { IScoringDecisionRepository } from './domain/IScoringDecisionRepository';
export type {
  IScoringDecisionTargetResolver,
  ScoringDecisionTargetSnapshot,
} from './domain/IScoringDecisionTargetResolver';
