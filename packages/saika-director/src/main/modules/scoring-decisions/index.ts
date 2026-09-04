export { scoringDecisionsModule } from './scoringDecisions.module';
export {
  allowAllScoringDecisions,
  type IScoringDecisionAdmissionPolicy,
} from './application/ScoringDecisionAdmissionPolicy';
export { ScoringDecisionProjector } from './domain/ScoringDecisionProjector';
export { getActiveScoringDecisions } from './domain/ScoringDecision';
export { SqliteScoringDecisionRepository } from './infra/SqliteScoringDecisionRepository';
export type { DecisionApplicationTrace, ScoreDecisionProjection } from './domain/ScoringDecisionProjector';
export type { ScoringClassificationCode, ScoringDecision, ScoringResultScope } from './domain/ScoringDecision';
export type { IScoringDecisionRepository } from './domain/IScoringDecisionRepository';
export type {
  IScoringDecisionTargetResolver,
  ScoringDecisionTargetSnapshot,
} from './domain/IScoringDecisionTargetResolver';
