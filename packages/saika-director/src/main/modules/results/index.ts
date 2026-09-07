// Domain entities (used by tests)
export { Result } from './domain/Result';
export { qualificationScoreSourceDigest } from './application/QualificationScoreOverlaySource';
export * from './application/ResultScoreCorrectionSource';
export type {
  IQualificationScoreOverlaySource,
  QualificationScoreOverlay,
  QualificationScoreOverlayHistory,
} from './application/QualificationScoreOverlaySource';
export { ResultId } from './domain/ResultId';
export type { IResultRepository } from './domain/IResultRepository';
export type { IFinalResultRepository } from './domain/IFinalResultRepository';
export { QualificationResultsReader, type IQualificationResultsReader } from './application/QualificationResultsReader';
export {
  FinalResultsReader,
  type FinalResultsSnapshot,
  type IFinalResultsReader,
} from './application/FinalResultsReader';
export { ScoringDecisionTargetResolver } from './application/ScoringDecisionTargetResolver';
export {
  applyResultClassificationOverlay,
  noResultClassificationOverlays,
  type IResultClassificationOverlaySource,
  type ResultClassificationOverlay,
} from './application/ResultClassificationOverlaySource';

// Composition-root adapter
export { SqliteResultRepository } from './infra/SqliteResultRepository';
export { SqliteFinalResultRepository } from './infra/SqliteFinalResultRepository';

// Module definition
export { resultsModule } from './results.module';
export { PublishMqttFinalResultsToken, PublishMqttMixedTeamFinalResultsToken, PublishMqttResultsToken } from './tokens';
export type { PublishMqttResultsCommand, PublishMqttResultLane } from './commands/PublishMqttResults';
