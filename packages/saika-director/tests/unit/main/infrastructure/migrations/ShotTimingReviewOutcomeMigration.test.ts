// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration022ShotObservationEvidence } from '@/main/infrastructure/database/migrations/022_shot_observation_evidence';
import { migration035RangeSafetyStop } from '@/main/infrastructure/database/migrations/035_range_safety_stop';
import { migration048TimedTargetObservationOutcome } from '@/main/infrastructure/database/migrations/048_timed_target_observation_outcome';
import { migration078ShotTimingReviewOutcome } from '@/main/infrastructure/database/migrations/078_shot_timing_review_outcome';

describe('migration078ShotTimingReviewOutcome', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    migration022ShotObservationEvidence.up(database);
    migration035RangeSafetyStop.up(database);
    migration048TimedTargetObservationOutcome.up(database);
  });

  afterEach(() => database.close());

  it('preserves evidence and accepts the distinct timed-window outcome without weakening append-only storage', () => {
    database
      .prepare(
        `INSERT INTO mqtt_shot_observation_evidence (
          evidence_id, observation_id, competition_id, lane_id, outcome,
          fired_at, received_at, observed_at, payload_json
        ) VALUES (?, ?, ?, ?, 'RECORDED', ?, ?, ?, '{}')`,
      )
      .run('evidence-old', 'observation-old', 'competition', 'lane', ...Array(3).fill('2026-09-03T00:00:00.000Z'));

    migration078ShotTimingReviewOutcome.up(database);

    expect(database.prepare('SELECT outcome FROM mqtt_shot_observation_evidence').get()).toEqual({
      outcome: 'RECORDED',
    });
    expect(() =>
      database
        .prepare(
          `INSERT INTO mqtt_shot_observation_evidence (
            evidence_id, observation_id, competition_id, lane_id, outcome,
            fired_at, received_at, observed_at, payload_json
          ) VALUES ('evidence-new', 'observation-new', 'competition', 'lane',
            'QUARANTINED_TIMING_REVIEW', '2026-09-03T00:01:00.000Z',
            '2026-09-03T00:01:00.010Z', '2026-09-03T00:01:00.020Z', '{}')`,
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      database
        .prepare("UPDATE mqtt_shot_observation_evidence SET outcome = 'RECORDED' WHERE evidence_id = 'evidence-new'")
        .run(),
    ).toThrow('append-only');
  });
});
