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
];
