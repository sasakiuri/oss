import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration037AdjudicationCases } from '@/main/infrastructure/database/migrations/037_adjudication_cases';
import { migration038FinalRecoveries } from '@/main/infrastructure/database/migrations/038_final_recoveries';
import { FinalRecoveryService, SqliteFinalRecoveryRepository } from '@/main/modules/final-recoveries';

const caseId = '11111111-1111-4111-8111-111111111111';
const linkId = '22222222-2222-4222-8222-222222222222';
const competitionId = '33333333-3333-4333-8333-333333333333';
const laneId = '44444444-4444-4444-8444-444444444444';

describe('migration038FinalRecoveries', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration037AdjudicationCases.up(database);
  });

  afterEach(() => database.close());

  it('preserves existing adjudication links while adding an explicit Final recovery artifact', () => {
    database
      .prepare(
        `INSERT INTO adjudication_cases (
          id, scope_type, scope_id, category, subject, summary, opened_by, opened_at, created_at
        ) VALUES (?, 'COMPETITION', ?, 'FINAL', 'Final issue', 'Summary', 'Jury A', ?, ?)`,
      )
      .run(caseId, competitionId, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z');
    database
      .prepare(
        `INSERT INTO adjudication_case_links (
          id, case_id, operation, artifact_type, artifact_id, relation, label_snapshot,
          statement, official_name, recorded_at, reverses_link_id
        ) VALUES (?, ?, 'ADD', 'FINAL_OPERATION', ?, 'SOURCE', 'Run', 'Initial link', 'Jury A', ?, NULL)`,
      )
      .run(linkId, caseId, competitionId, '2026-09-02T00:00:00.000Z');

    migration038FinalRecoveries.up(database);

    expect(database.prepare('SELECT artifact_type FROM adjudication_case_links WHERE id = ?').get(linkId)).toEqual({
      artifact_type: 'FINAL_OPERATION',
    });
    expect(() =>
      database
        .prepare(
          `INSERT INTO adjudication_case_links (
            id, case_id, operation, artifact_type, artifact_id, relation, label_snapshot,
            statement, official_name, recorded_at, reverses_link_id
          ) VALUES (?, ?, 'ADD', 'FINAL_RECOVERY', ?, 'RECOVERY', 'Recovery', 'Linked', 'Jury A', ?, NULL)`,
        )
        .run(crypto.randomUUID(), caseId, crypto.randomUUID(), '2026-09-02T00:01:00.000Z'),
    ).not.toThrow();
  });

  it('persists and protects append-only recovery records', () => {
    migration038FinalRecoveries.up(database);
    const service = new FinalRecoveryService(new SqliteFinalRecoveryRepository(database));
    let value = service.create({
      competitionId,
      procedureProfile: 'RIFLE_PISTOL_10M_50M',
      incidentType: 'EST_FAILURE',
      phase: 'MATCH_SINGLE',
      affectedLaneIds: [laneId],
      summary: 'Unexpected zero.',
      openedBy: 'Jury A',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'JURY_RULING',
      classification: 'TARGET_MALFUNCTION',
      statement: 'Three-person Jury found no credible evidence of a miss.',
      officialName: 'Jury A',
      ruleReference: '6.17.1.8(b)',
    });

    expect(service.listByCompetition(competitionId)[0]?.entries[0]?.classification).toBe('TARGET_MALFUNCTION');
    expect(() =>
      database.prepare('UPDATE final_recovery_cases SET summary = ? WHERE id = ?').run('Changed', value.id),
    ).toThrow('append-only');
    expect(() => database.prepare('DELETE FROM final_recovery_entries WHERE case_id = ?').run(value.id)).toThrow(
      'append-only',
    );
  });
});
