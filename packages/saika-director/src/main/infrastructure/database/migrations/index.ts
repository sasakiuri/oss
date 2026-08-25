import type { Migration } from './Migration';
import { migration003CreateSchema } from './003_create_schema';
import { migration004AddResultsStatus } from './004_add_results_status';
import { migration005AddFinalResults } from './005_add_final_results';
import { migration006LaneState } from './006_lane_state';
import { migration007MqttRetainedMessages } from './007_mqtt_retained_messages';
import { migration008UniqueFinalResults } from './008_unique_final_results';
import { migration009ResultSourceCompetition } from './009_result_source_competition';

export const allMigrations: Migration[] = [
  migration003CreateSchema,
  migration004AddResultsStatus,
  migration005AddFinalResults,
  migration006LaneState,
  migration007MqttRetainedMessages,
  migration008UniqueFinalResults,
  migration009ResultSourceCompetition,
];
