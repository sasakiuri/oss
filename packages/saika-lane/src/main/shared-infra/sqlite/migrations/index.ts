// SPDX-License-Identifier: MIT
import { migration001 } from './001_score_units';
import { migration002 } from './002_shot_observations';
import { migration003 } from './003_shot_evidence_outbox';
import { migration004 } from './004_safety_stop_events';
import { migration005 } from './005_shoot_off_outbox';
import { migration006 } from './006_range_officer_requests';
import { migration007 } from './007_timed_target_events';
import { migration008 } from './008_multi_shot_shoot_off';
import { migration009 } from './009_scoring_geometry';
import { migration010 } from './010_qualification_recovery';
import { migration011 } from './011_recovery_shot_outbox';
import { migration012 } from './012_recovery_adjudications';
import { migration013 } from './013_recovery_settlements';
import { migration014 } from './014_malfunction_signals';
import { migration015 } from './015_est_complaint_signals';
import { migration016 } from './016_official_command_observations';
import { migration017 } from './017_malfunction_firing';
import { migration018 } from './018_reserve_lane_transfers';
import { migration019 } from './019_observation_timestamp_source';
import type { Migration } from './Migration';

/** Append migrations here; published versions and their order are permanent. */
export const allMigrations: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
];
