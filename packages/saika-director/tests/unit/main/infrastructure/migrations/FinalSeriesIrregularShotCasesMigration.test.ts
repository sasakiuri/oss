// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration014RangeIncidentReports } from '@/main/infrastructure/database/migrations/014_range_incident_reports';
import { migration040IrregularShotCases } from '@/main/infrastructure/database/migrations/040_irregular_shot_cases';
import { migration051FinalSeriesIrregularShotCases } from '@/main/infrastructure/database/migrations/051_final_series_irregular_shot_cases';

describe('migration051FinalSeriesIrregularShotCases', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration003CreateSchema.up(database);
    migration014RangeIncidentReports.up(database);
    migration040IrregularShotCases.up(database);
    database.exec(`
      INSERT INTO championships (id, name, date, venue) VALUES ('championship', 'Test', '2026-09-01', 'Range');
      INSERT INTO events (id, championship_id, name, event_type, round)
        VALUES ('event', 'championship', 'Final', 'RFPM_FINAL', 'Final');
      INSERT INTO irregular_shot_cases (
        id, event_id, competition_id, result_scope, kind, subject_lane_id,
        adjacent_lane_ids_json, window_start_at, window_end_at, summary,
        rule_reference, opened_by, occurred_at, created_at
      ) VALUES (
        'old-case', 'event', 'competition', 'FINAL', 'DISPUTED_SHOT', 'lane', '[]',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:10.000Z', 'Existing case',
        'ISSF 6.11.6', 'Jury', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
      );
      INSERT INTO range_incident_reports (
        id, event_id, serial_number, event_name, occurred_at, details,
        rule_references, initiator_role, initiator_name, created_at
      ) VALUES (
        'report', 'event', 'IR-1', 'Final', '2026-09-01T00:00:00.000Z', 'READY violation',
        '6.17.4(n)', 'COMPETITION_JURY_MEMBER', 'Jury', '2026-09-01T00:01:00.000Z'
      );
    `);
  });

  afterEach(() => database.close());

  it('preserves old cases and accepts new immutable incident and resolution codes', () => {
    migration051FinalSeriesIrregularShotCases.up(database);

    expect(database.prepare('SELECT kind FROM irregular_shot_cases WHERE id = ?').get('old-case')).toEqual({
      kind: 'DISPUTED_SHOT',
    });
    database.exec(`
      INSERT INTO irregular_shot_cases (
        id, event_id, competition_id, result_scope, kind, subject_lane_id,
        adjacent_lane_ids_json, window_start_at, window_end_at, summary,
        rule_reference, opened_by, occurred_at, created_at
      ) VALUES (
        'ready-case', 'event', 'competition', 'FINAL', 'READY_POSITION', 'lane', '[]',
        '2026-09-01T00:02:00.000Z', '2026-09-01T00:02:10.000Z', 'READY violation',
        '6.17.4(n)', 'Jury', '2026-09-01T00:02:00.000Z', '2026-09-01T00:02:00.000Z'
      );
      INSERT INTO irregular_shot_case_entries (
        id, case_id, entry_type, statement, official_name, resolution_code,
        incident_report_id, scoring_decision_ids_json, occurred_at, recorded_at
      ) VALUES (
        'resolution', 'ready-case', 'RESOLVED', 'Two-hit penalty applied.', 'Jury',
        'HIT_PENALTY_APPLIED', 'report', '["decision"]',
        '2026-09-01T00:03:00.000Z', '2026-09-01T00:03:00.000Z'
      );
    `);

    expect(database.pragma('foreign_key_check')).toEqual([]);
    expect(() =>
      database.prepare('UPDATE irregular_shot_cases SET summary = ? WHERE id = ?').run('Changed', 'ready-case'),
    ).toThrow('append-only');
  });
});
