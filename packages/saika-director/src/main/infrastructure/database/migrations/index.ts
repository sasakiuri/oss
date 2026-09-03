import type { Migration } from './Migration';
import { migration003CreateSchema } from './003_create_schema';
import { migration004AddResultsStatus } from './004_add_results_status';
import { migration005AddFinalResults } from './005_add_final_results';
import { migration006LaneState } from './006_lane_state';
import { migration007MqttRetainedMessages } from './007_mqtt_retained_messages';
import { migration008UniqueFinalResults } from './008_unique_final_results';
import { migration009ResultSourceCompetition } from './009_result_source_competition';
import { migration010MqttCompetitionShotJournal } from './010_mqtt_competition_shot_journal';
import { migration011ScoringDecisions } from './011_scoring_decisions';
import { migration012OfficialRankingEvidence } from './012_official_ranking_evidence';
import { migration013ResultVerification } from './013_result_verification';
import { migration014RangeIncidentReports } from './014_range_incident_reports';
import { migration015ProtectIncidentReportEvents } from './015_protect_incident_report_events';
import { migration016FinalPlacementReviews } from './016_final_placement_reviews';
import { migration017ResultPublication } from './017_result_publication';
import { migration018FiringWindowReview } from './018_firing_window_review';
import { migration019TargetExaminations } from './019_target_examinations';
import { migration020RangeInterruptions } from './020_range_interruptions';
import { migration021TargetRecoveryAssessments } from './021_target_recovery_assessments';
import { migration022ShotObservationEvidence } from './022_shot_observation_evidence';
import { migration023RelayReadiness } from './023_relay_readiness';
import { migration024RangeInterruptionBatches } from './024_range_interruption_batches';
import { migration025OfficialEntries } from './025_official_entries';
import { migration026Protests } from './026_protests';
import { migration027EstBackupVerification } from './027_est_backup_verification';
import { migration028FinalControl } from './028_final_control';
import { migration029MixedTeamFinalControl } from './029_mixed_team_final_control';
import { migration030MixedTeamFinalResults } from './030_mixed_team_final_results';
import { migration031SquaddingDraws } from './031_squadding_draws';
import { migration032ProductionOperations } from './032_production_operations';
import { migration033MixedTeamTimeouts } from './033_mixed_team_timeouts';
import { migration034FinalResultDeclarations } from './034_final_result_declarations';
import { migration035RangeSafetyStop } from './035_range_safety_stop';
import { migration036FinalOperations } from './036_final_operations';
import { migration037AdjudicationCases } from './037_adjudication_cases';
import { migration038FinalRecoveries } from './038_final_recoveries';
import { migration039StartLists } from './039_start_lists';
import { migration040IrregularShotCases } from './040_irregular_shot_cases';
import { migration041IssfEstRelayChecklist } from './041_issf_est_relay_checklist';
import { migration042EstChampionshipInspections } from './042_est_championship_inspections';
import { migration043ResultsBooks } from './043_results_books';
import { migration044EventRulePackBinding } from './044_event_rule_pack_binding';
import { migration045FinalCountbackResolution } from './045_final_countback_resolution';
import { migration046OutdoorEliminationPlans } from './046_outdoor_elimination_plans';
import { migration047RelayAthleteLifecycle } from './047_relay_athlete_lifecycle';
import { migration048TimedTargetObservationOutcome } from './048_timed_target_observation_outcome';
import { migration049FinalStartNumberResolution } from './049_final_start_number_resolution';
import { migration050MultiShotFinalShootOff } from './050_multi_shot_final_shoot_off';
import { migration051FinalSeriesIrregularShotCases } from './051_final_series_irregular_shot_cases';
import { migration052ScoringGeometryEvidence } from './052_scoring_geometry_evidence';
import { migration053QualificationTimedTargetInterruptions } from './053_qualification_timed_target_interruptions';
import { migration054QualificationTimedTargetRecoveryDecisions } from './054_qualification_timed_target_recovery_decisions';
import { migration055QualificationRecoveryExecutionEvents } from './055_qualification_recovery_execution_events';
import { migration056QualificationRecoveryAdjudicationEvents } from './056_qualification_recovery_adjudication_events';
import { migration057QualificationRecoverySettlements } from './057_qualification_recovery_settlements';

export const allMigrations: Migration[] = [
  migration003CreateSchema,
  migration004AddResultsStatus,
  migration005AddFinalResults,
  migration006LaneState,
  migration007MqttRetainedMessages,
  migration008UniqueFinalResults,
  migration009ResultSourceCompetition,
  migration010MqttCompetitionShotJournal,
  migration011ScoringDecisions,
  migration012OfficialRankingEvidence,
  migration013ResultVerification,
  migration014RangeIncidentReports,
  migration015ProtectIncidentReportEvents,
  migration016FinalPlacementReviews,
  migration017ResultPublication,
  migration018FiringWindowReview,
  migration019TargetExaminations,
  migration020RangeInterruptions,
  migration021TargetRecoveryAssessments,
  migration022ShotObservationEvidence,
  migration023RelayReadiness,
  migration024RangeInterruptionBatches,
  migration025OfficialEntries,
  migration026Protests,
  migration027EstBackupVerification,
  migration028FinalControl,
  migration029MixedTeamFinalControl,
  migration030MixedTeamFinalResults,
  migration031SquaddingDraws,
  migration032ProductionOperations,
  migration033MixedTeamTimeouts,
  migration034FinalResultDeclarations,
  migration035RangeSafetyStop,
  migration036FinalOperations,
  migration037AdjudicationCases,
  migration038FinalRecoveries,
  migration039StartLists,
  migration040IrregularShotCases,
  migration041IssfEstRelayChecklist,
  migration042EstChampionshipInspections,
  migration043ResultsBooks,
  migration044EventRulePackBinding,
  migration045FinalCountbackResolution,
  migration046OutdoorEliminationPlans,
  migration047RelayAthleteLifecycle,
  migration048TimedTargetObservationOutcome,
  migration049FinalStartNumberResolution,
  migration050MultiShotFinalShootOff,
  migration051FinalSeriesIrregularShotCases,
  migration052ScoringGeometryEvidence,
  migration053QualificationTimedTargetInterruptions,
  migration054QualificationTimedTargetRecoveryDecisions,
  migration055QualificationRecoveryExecutionEvents,
  migration056QualificationRecoveryAdjudicationEvents,
  migration057QualificationRecoverySettlements,
];
