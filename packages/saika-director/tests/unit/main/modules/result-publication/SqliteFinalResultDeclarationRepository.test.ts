import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration013ResultVerification } from '@/main/infrastructure/database/migrations/013_result_verification';
import { migration034FinalResultDeclarations } from '@/main/infrastructure/database/migrations/034_final_result_declarations';
import { FinalResultDeclaration, SqliteFinalResultDeclarationRepository } from '@/main/modules/result-publication';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const APPROVAL_ID = '22222222-2222-4222-8222-222222222222';

describe('SqliteFinalResultDeclarationRepository', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  function setup() {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration003CreateSchema.up(database);
    migration013ResultVerification.up(database);
    migration034FinalResultDeclarations.up(database);
    database
      .prepare("INSERT INTO championships (id, name, date, venue) VALUES ('c-1', 'Meet', '2026-08-01', 'Range')")
      .run();
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES (?, 'c-1', 'Final', 'AR60_FINAL', 'Final', 0)`,
      )
      .run(EVENT_ID);
    database
      .prepare(
        `INSERT INTO result_list_approval_entries (
           id, event_id, result_scope, entry_type, snapshot_revision, required_individual_checks,
           required_team_checks, check_ids_json, statement, official_name, recorded_at, reverses_approval_id
         ) VALUES (?, ?, 'FINAL', 'APPROVAL', ?, 0, 0, '[]', 'Verified', 'RTS', ?, NULL)`,
      )
      .run(APPROVAL_ID, EVENT_ID, 'a'.repeat(64), '2026-08-01T00:00:00.000Z');
    return new SqliteFinalResultDeclarationRepository(database);
  }

  it('round-trips one append-only Final declaration', () => {
    const repository = setup();
    const declaration = FinalResultDeclaration.create({
      eventId: EVENT_ID,
      snapshotRevision: 'a'.repeat(64),
      approvalId: APPROVAL_ID,
      finalProtestsResolved: true,
      resultProcessConfirmed: true,
      statement: 'RESULTS ARE FINAL',
      officialName: 'CRO',
      declaredAt: new Date('2026-08-01T01:00:00.000Z'),
    });
    repository.append(declaration);

    expect(repository.findByEvent(EVENT_ID)).toEqual(declaration);
    expect(() => database!.prepare('UPDATE final_result_declarations SET statement = statement').run()).toThrow(
      'append-only',
    );
    expect(() => database!.prepare('DELETE FROM final_result_declarations').run()).toThrow('append-only');
    expect(() => repository.append(declaration)).toThrow('UNIQUE constraint failed');
  });
});
