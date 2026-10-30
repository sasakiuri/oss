// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration022ShotObservationEvidence } from '@/main/infrastructure/database/migrations/022_shot_observation_evidence';
import { migration035RangeSafetyStop } from '@/main/infrastructure/database/migrations/035_range_safety_stop';
import { migration048TimedTargetObservationOutcome } from '@/main/infrastructure/database/migrations/048_timed_target_observation_outcome';
import { migration078ShotTimingReviewOutcome } from '@/main/infrastructure/database/migrations/078_shot_timing_review_outcome';

import { migration090NullifiedPositionExtra } from '@/main/infrastructure/database/migrations/090_nullified_position_extra';

describe('migration090NullifiedPositionExtra', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    migration022ShotObservationEvidence.up(database);
    migration035RangeSafetyStop.up(database);
    migration048TimedTargetObservationOutcome.up(database);
    migration078ShotTimingReviewOutcome.up(database);
  });

  afterEach(() => database.close());

  it('preserves evidence and accepts a nullified position extra without weakening append-only storage', () => {
    database
      .prepare(
        `INSERT INTO mqtt_shot_observation_evidence (
          evidence_id, observation_id, competition_id, lane_id, outcome,
          fired_at, received_at, observed_at, payload_json
        ) VALUES (?, ?, ?, ?, 'RECORDED', ?, ?, ?, '{}')`,
      )
      .run('evidence-old', 'observation-old', 'competition', 'lane', ...Array(3).fill('2026-09-03T00:00:00.000Z'));

    const schema = database
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('trigger', 'index') ORDER BY name",
      )
      .all('mqtt_shot_observation_evidence');
    migration090NullifiedPositionExtra.up(database);
    expect(
      database
        .prepare(
          "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('trigger', 'index') ORDER BY name",
        )
        .all('mqtt_shot_observation_evidence'),
    ).toEqual(schema);

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
            'NULLIFIED_POSITION_EXTRA', '2026-09-03T00:01:00.000Z',
            '2026-09-03T00:01:00.010Z', '2026-09-03T00:01:00.020Z', '{}')`,
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      database
        .prepare("UPDATE mqtt_shot_observation_evidence SET outcome = 'RECORDED' WHERE evidence_id = 'evidence-new'")
        .run(),
    ).toThrow('append-only');
    expect(() => database.exec('DELETE FROM mqtt_shot_observation_evidence')).toThrow('append-only');
    expect(() =>
      database.exec(
        "INSERT INTO mqtt_shot_observation_evidence SELECT 'invalid', observation_id, competition_id, lane_id, 'INVALID', fired_at, received_at, observed_at, payload_json FROM mqtt_shot_observation_evidence LIMIT 1",
      ),
    ).toThrow(/CHECK/);
  });
});
