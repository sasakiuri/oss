export type {
  CompetitionTypeDefinition,
  RoundType,
  ScoringConfig,
  DisplayHints,
  ResultFormat,
} from './CompetitionTypeDefinition';
export type { CompetitionTypeStrategy } from './CompetitionTypeStrategy';
export { CompetitionTypeRegistry, competitionTypeRegistry } from './CompetitionTypeRegistry';
export { IssfStandardStrategy } from './strategies/IssfStandardStrategy';
export { registerBuiltinCompetitionTypes } from './registerBuiltinCompetitionTypes';
