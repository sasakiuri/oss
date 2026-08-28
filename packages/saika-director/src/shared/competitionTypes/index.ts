export type {
  CompetitionTypeDefinition,
  RoundType,
  ScoringConfig,
  DisplayHints,
  ResultFormat,
} from './CompetitionTypeDefinition';
export type {
  CompetitionTypeStrategy,
  QualificationRankingInput,
  RankingShotEvidence,
} from './CompetitionTypeStrategy';
export { CompetitionTypeRegistry, competitionTypeRegistry } from './CompetitionTypeRegistry';
export {
  getAvailableSeriesShotCounts,
  getMatchSeriesShotCounts,
  getSeriesIndexForShot,
  sumScoresBySeries,
} from './ScoringSeriesLayout';
export { IssfStandardStrategy } from './strategies/IssfStandardStrategy';
export { registerBuiltinCompetitionTypes } from './registerBuiltinCompetitionTypes';
