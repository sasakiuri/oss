// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration036FinalOperations } from '@/main/infrastructure/database/migrations/036_final_operations';
import { migration050MultiShotFinalShootOff } from '@/main/infrastructure/database/migrations/050_multi_shot_final_shoot_off';

describe('migration050MultiShotFinalShootOff', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration036FinalOperations.up(database);
    database.exec(`
      INSERT INTO final_operation_runs (
        id, competition_id, competition_type_id, rule_pack_id, script_version,
        script_snapshot_json, scheduled_start_at, created_by, created_at
      ) VALUES (
        'run', 'competition', 'AR60_FINAL', 'pack', '1', '{}',
        '2026-09-01T00:00:00.000Z', 'CRO', '2026-09-01T00:00:00.000Z'
      );
      INSERT INTO final_operation_shoot_off_shots (
        id, run_id, iteration, lane_id, shot_id, score_x10, fired_at, observed_at
      ) VALUES (
        'one', 'run', 1, 'lane', 'shot-one', 103,
        '2026-09-01T00:00:01.000Z', '2026-09-01T00:00:01.100Z'
      );
    `);
  });

  afterEach(() => database.close());

  it('preserves old shots and permits multiple immutable shots per Lane and round', () => {
    migration050MultiShotFinalShootOff.up(database);

    expect(database.prepare('SELECT score_x10, source_score_x10 FROM final_operation_shoot_off_shots').get()).toEqual({
      score_x10: 103,
      source_score_x10: 103,
    });
    expect(() =>
      database.exec(`
        INSERT INTO final_operation_shoot_off_shots (
          id, run_id, iteration, lane_id, shot_id, score_x10, source_score_x10, fired_at, observed_at
        ) VALUES (
          'two', 'run', 1, 'lane', 'shot-two', 10, 102,
          '2026-09-01T00:00:02.000Z', '2026-09-01T00:00:02.100Z'
        );
      `),
    ).not.toThrow();
    expect(() =>
      database.prepare('UPDATE final_operation_shoot_off_shots SET score_x10 = 0 WHERE id = ?').run('two'),
    ).toThrow('append-only');
  });
});
