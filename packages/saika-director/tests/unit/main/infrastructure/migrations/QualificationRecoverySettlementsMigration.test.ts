// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration020RangeInterruptions } from '@/main/infrastructure/database/migrations/020_range_interruptions';
import { migration054QualificationTimedTargetRecoveryDecisions } from '@/main/infrastructure/database/migrations/054_qualification_timed_target_recovery_decisions';
import { migration057QualificationRecoverySettlements } from '@/main/infrastructure/database/migrations/057_qualification_recovery_settlements';

describe('migration057QualificationRecoverySettlements', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration020RangeInterruptions.up(database);
    migration054QualificationTimedTargetRecoveryDecisions.up(database);
    migration057QualificationRecoverySettlements.up(database);
  });

  afterEach(() => database.close());

  it('creates decision-bound append-only settlement requests and outcomes', () => {
    const caseId = '11111111-1111-4111-8111-111111111111';
    const decisionId = '22222222-2222-4222-8222-222222222222';
    const settlementId = '33333333-3333-4333-8333-333333333333';
    database
      .prepare(
        `INSERT INTO range_interruption_cases (
          id, cause, phase, started_at, remaining_seconds_at_start, lane_id,
          summary, details, opened_by, created_at
        ) VALUES (?, 'ATHLETE_NON_FAULT', 'MATCH', ?, 0, ?, ?, ?, ?, ?)`,
      )
      .run(
        caseId,
        '2026-09-04T01:00:00.000Z',
        '44444444-4444-4444-8444-444444444444',
        'Interrupted series',
        'All shots recorded',
        'Range Officer A',
        '2026-09-04T01:00:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO qualification_timed_target_recovery_decisions (
          id, case_id, recommendation_json, authorized_recovery_json, follows_recommendation,
          statement, official_name, incident_report_reference, rule_reference, decided_at, recorded_at
        ) VALUES (?, ?, '{}', '{}', 1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        decisionId,
        caseId,
        'Retain the series',
        'Jury Member A',
        'RIR-KEEP-001',
        'ISSF 8.8.1',
        '2026-09-04T01:15:00.000Z',
        '2026-09-04T01:15:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO qualification_recovery_settlement_requests (
          settlement_id, case_id, decision_id, competition_id, lane_id, treatment,
          stage_index, series_index, expected_match_program_id, expected_series_shot_limit,
          expected_recorded_shots, decision_official_name, decision_rule_reference,
          decided_at, applied_by, statement, applied_at, requested_at
        ) VALUES (?, ?, ?, ?, ?, 'KEEP_RECORDED_SERIES', 1, 0, ?, 5, 5, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        settlementId,
        caseId,
        decisionId,
        '55555555-5555-4555-8555-555555555555',
        '44444444-4444-4444-8444-444444444444',
        'P25_MATCH_PRECISION_240',
        'Jury Member A',
        'ISSF 8.8.1',
        '2026-09-04T01:15:00.000Z',
        'Jury Member B',
        'Five recorded shots retained',
        '2026-09-04T01:16:00.000Z',
        '2026-09-04T01:16:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO qualification_recovery_settlement_events (
          id, event_key, settlement_id, event_type, payload_json, occurred_at, recorded_at
        ) VALUES (?, ?, ?, 'SETTLEMENT_RESULT', '{}', ?, ?)`,
      )
      .run(
        '66666666-6666-4666-8666-666666666666',
        'settlement-result:one',
        settlementId,
        '2026-09-04T01:16:01.000Z',
        '2026-09-04T01:16:01.000Z',
      );

    expect(() =>
      database.prepare("UPDATE qualification_recovery_settlement_requests SET statement = 'changed'").run(),
    ).toThrow('immutable');
    expect(() => database.prepare('DELETE FROM qualification_recovery_settlement_events').run()).toThrow('append-only');
  });
});
