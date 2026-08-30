export type {
  CompetitionTypeDefinition,
  RoundType,
  ScoringConfig,
  DisplayHints,
  ResultFormat,
  TimerAnnouncementPolicy,
  CompetitionStartPhase,
  PhaseStartRequirement,
  PhaseStartRequirementTiming,
  PhaseStartRequirements,
  FiringWindowTimestampSource,
  FiringWindowViolationKind,
  FiringWindowDetectionRule,
  FiringWindowDetectionPolicy,
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
export {
  competitionTypeFromRulePack,
  DEFAULT_FIRING_WINDOW_CLOCK_TOLERANCE_MILLISECONDS,
  RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
  RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
  RULE_PACK_SETUP_REQUIREMENT_ID,
  RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
} from './fromRulePack';
