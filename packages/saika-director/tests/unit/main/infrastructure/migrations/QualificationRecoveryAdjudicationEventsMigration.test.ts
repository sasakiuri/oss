// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration020RangeInterruptions } from '@/main/infrastructure/database/migrations/020_range_interruptions';
import { migration054QualificationTimedTargetRecoveryDecisions } from '@/main/infrastructure/database/migrations/054_qualification_timed_target_recovery_decisions';
import { migration055QualificationRecoveryExecutionEvents } from '@/main/infrastructure/database/migrations/055_qualification_recovery_execution_events';
import { migration056QualificationRecoveryAdjudicationEvents } from '@/main/infrastructure/database/migrations/056_qualification_recovery_adjudication_events';

describe('migration056QualificationRecoveryAdjudicationEvents', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration020RangeInterruptions.up(database);
    migration054QualificationTimedTargetRecoveryDecisions.up(database);
    migration055QualificationRecoveryExecutionEvents.up(database);
  });

  afterEach(() => database.close());

  it('preserves prior events and adds append-only adjudication outcomes', () => {
    database
      .prepare(
        `INSERT INTO range_interruption_cases (
          id, cause, phase, started_at, remaining_seconds_at_start, lane_id,
          summary, details, opened_by, created_at
        ) VALUES (?, 'ATHLETE_NON_FAULT', 'MATCH', ?, 0, ?, ?, ?, ?, ?)`,
      )
      .run(
        '11111111-1111-4111-8111-111111111111',
        '2026-09-03T01:00:00.000Z',
        '22222222-2222-4222-8222-222222222222',
        'Interrupted series',
        'Technical fault',
        'Range Officer A',
        '2026-09-03T01:00:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO qualification_timed_target_recovery_decisions (
          id, case_id, recommendation_json, authorized_recovery_json, follows_recommendation,
          statement, official_name, incident_report_reference, rule_reference, decided_at, recorded_at
        ) VALUES (?, ?, '{}', '{}', 1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        'Apply the prescribed recovery',
        'Jury Member A',
        'RIR-25M-001',
        'ISSF 8.8.1',
        '2026-09-03T01:15:00.000Z',
        '2026-09-03T01:15:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO qualification_recovery_executions (
          run_id, case_id, decision_id, competition_id, lane_id, phase,
          stage_index, series_index, expected_match_program_id,
          expected_series_shot_limit, expected_recorded_shots, authorization_json,
          official_name, decision_rule_reference, decided_at, requested_at
        ) VALUES (?, ?, ?, ?, ?, 'SERIES_RECOVERY', 1, 0, ?, 5, 2, '{}', ?, ?, ?, ?)`,
      )
      .run(
        '44444444-4444-4444-8444-444444444444',
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        '55555555-5555-4555-8555-555555555555',
        '22222222-2222-4222-8222-222222222222',
        'P25_MATCH_PRECISION_240',
        'Jury Member A',
        'ISSF 8.8.1',
        '2026-09-03T01:15:00.000Z',
        '2026-09-03T01:16:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO qualification_recovery_execution_events (
          id, event_key, run_id, event_type, payload_json, occurred_at, recorded_at
        ) VALUES (?, ?, ?, 'START_RESULT', '{}', ?, ?)`,
      )
      .run(
        '66666666-6666-4666-8666-666666666666',
        'start-result:existing',
        '44444444-4444-4444-8444-444444444444',
        '2026-09-03T01:16:01.000Z',
        '2026-09-03T01:16:01.000Z',
      );

    migration056QualificationRecoveryAdjudicationEvents.up(database);

    expect(database.prepare('SELECT event_type FROM qualification_recovery_execution_events').all()).toEqual([
      { event_type: 'START_RESULT' },
    ]);
    expect(() =>
      database
        .prepare(
          `INSERT INTO qualification_recovery_execution_events (
            id, event_key, run_id, event_type, payload_json, occurred_at, recorded_at
          ) VALUES (?, ?, ?, 'ADJUDICATION_REQUESTED', '{}', ?, ?)`,
        )
        .run(
          '77777777-7777-4777-8777-777777777777',
          'adjudication-requested:existing',
          '44444444-4444-4444-8444-444444444444',
          '2026-09-03T01:19:00.000Z',
          '2026-09-03T01:19:00.000Z',
        ),
    ).not.toThrow();
    expect(() =>
      database
        .prepare("UPDATE qualification_recovery_execution_events SET payload_json = '{}' WHERE event_key = ?")
        .run('adjudication-requested:existing'),
    ).toThrow('append-only');
    expect(() =>
      database
        .prepare('DELETE FROM qualification_recovery_execution_events WHERE event_key = ?')
        .run('adjudication-requested:existing'),
    ).toThrow('append-only');
  });
});
