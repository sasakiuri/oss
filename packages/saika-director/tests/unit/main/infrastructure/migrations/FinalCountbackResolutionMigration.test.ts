// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration028FinalControl } from '@/main/infrastructure/database/migrations/028_final_control';
import { migration045FinalCountbackResolution } from '@/main/infrastructure/database/migrations/045_final_countback_resolution';

describe('migration045FinalCountbackResolution', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration028FinalControl.up(database);
  });

  afterEach(() => database.close());

  it('preserves prior decisions and entries while accepting COUNTBACK', () => {
    const priorDecisionId = '11111111-1111-4111-8111-111111111111';
    database
      .prepare(
        `INSERT INTO final_control_decisions (
          id, competition_id, competition_type_id, participant_count, after_shot, rank,
          selected_lane_id, score_snapshot_json, tied_lane_ids_json, resolution,
          official_name, rule_reference, recorded_at
        ) VALUES (?, 'competition', 'type', 8, 30, 8, 'lane-a', '[]', '[]',
          'CLEAR_LOWEST', 'Jury A', '6.17.3', '2026-09-01T00:00:00.000Z')`,
      )
      .run(priorDecisionId);
    database
      .prepare(
        `INSERT INTO final_control_entries (
          id, decision_id, entry_type, command_id, command_status, statement, official_name, recorded_at
        ) VALUES ('22222222-2222-4222-8222-222222222222', ?, 'COMMAND_RESULT',
          'command', 'DONE', 'Retired', 'Jury A', '2026-09-01T00:01:00.000Z')`,
      )
      .run(priorDecisionId);

    migration045FinalCountbackResolution.up(database);

    expect(
      database.prepare('SELECT resolution FROM final_control_decisions WHERE id = ?').get(priorDecisionId),
    ).toEqual({
      resolution: 'CLEAR_LOWEST',
    });
    expect(database.prepare('SELECT decision_id FROM final_control_entries').get()).toEqual({
      decision_id: priorDecisionId,
    });
    expect(() =>
      database
        .prepare(
          `INSERT INTO final_control_decisions (
            id, competition_id, competition_type_id, participant_count, after_shot, rank,
            selected_lane_id, score_snapshot_json, tied_lane_ids_json, resolution,
            resolution_statement, official_name, rule_reference, recorded_at
          ) VALUES ('33333333-3333-4333-8333-333333333333', 'competition', 'type', 8, 30, 8,
            'lane-b', '[]', '["lane-a","lane-b"]', 'COUNTBACK', 'Second standing series',
            'Jury B', '6.17.3(d)', '2026-09-01T00:02:00.000Z')`,
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      database
        .prepare('UPDATE final_control_decisions SET official_name = ? WHERE id = ?')
        .run('Changed', priorDecisionId),
    ).toThrow('append-only');
  });
});
