// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration028FinalControl } from '@/main/infrastructure/database/migrations/028_final_control';
import { migration045FinalCountbackResolution } from '@/main/infrastructure/database/migrations/045_final_countback_resolution';
import { migration049FinalStartNumberResolution } from '@/main/infrastructure/database/migrations/049_final_start_number_resolution';

describe('migration049FinalStartNumberResolution', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration028FinalControl.up(database);
    migration045FinalCountbackResolution.up(database);
  });

  afterEach(() => database.close());

  it('preserves existing decisions and accepts FINAL_START_NUMBER', () => {
    database.exec(`
      INSERT INTO final_control_decisions (
        id, competition_id, competition_type_id, participant_count, after_shot, rank,
        selected_lane_id, score_snapshot_json, tied_lane_ids_json, resolution,
        official_name, rule_reference, recorded_at
      ) VALUES (
        '11111111-1111-4111-8111-111111111111', 'competition', 'R3P_FINAL', 8, 30, 8,
        'lane-a', '[]', '[]', 'COUNTBACK', 'Jury A', '6.17.3', '2026-09-01T00:00:00.000Z'
      );
    `);

    migration049FinalStartNumberResolution.up(database);

    expect(database.prepare('SELECT resolution FROM final_control_decisions').all()).toEqual([
      { resolution: 'COUNTBACK' },
    ]);
    expect(() =>
      database.exec(`
        INSERT INTO final_control_decisions (
          id, competition_id, competition_type_id, participant_count, after_shot, rank,
          selected_lane_id, score_snapshot_json, tied_lane_ids_json, resolution,
          official_name, rule_reference, recorded_at
        ) VALUES (
          '22222222-2222-4222-8222-222222222222', 'competition', 'RFPM_FINAL', 8, 15, 8,
          'lane-b', '[]', '["lane-a","lane-b"]', 'FINAL_START_NUMBER',
          'Jury B', '6.17.4(k)', '2026-09-01T00:01:00.000Z'
        );
      `),
    ).not.toThrow();
  });
});
