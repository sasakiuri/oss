export { scoringDecisionsModule } from './scoringDecisions.module';
export { type IScoringDecisionAdmissionPolicy } from './application/ScoringDecisionAdmissionPolicy';
export { ScoringDecisionProjector } from './domain/ScoringDecisionProjector';
export { compareDecisionOrder, getActiveScoringDecisions } from './domain/ScoringDecision';
export { SqliteScoringDecisionRepository } from './infra/SqliteScoringDecisionRepository';
export type { DecisionApplicationTrace, ScoreDecisionProjection } from './domain/ScoringDecisionProjector';
export type { ScoringClassificationCode, ScoringDecision } from './domain/ScoringDecision';
export type { IScoringDecisionRepository } from './domain/IScoringDecisionRepository';
export type {
  IScoringDecisionTargetResolver,
  ScoringDecisionTargetSnapshot,
} from './domain/IScoringDecisionTargetResolver';
