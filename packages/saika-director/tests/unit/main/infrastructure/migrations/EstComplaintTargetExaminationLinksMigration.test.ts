// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  SqliteEstComplaintCaseLinkRepository,
  estComplaintSnapshotHash,
  type EstComplaintCaseLink,
} from '@/main/modules/est-complaints';
import { SqliteTargetExaminationRepository, TargetExaminationService } from '@/main/modules/target-examinations';

const competitionId = '11111111-1111-4111-8111-111111111111';
const signalId = '22222222-2222-4222-8222-222222222222';

describe('migration061EstComplaintTargetExaminationLinks', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
  });

  afterEach(() => database.close());

  it('round-trips a verified Lane snapshot and protects the provenance link', () => {
    const targetService = new TargetExaminationService(new SqliteTargetExaminationRepository(database));
    const examination = targetService.createNow({
      scopes: [{ scopeType: 'COMPETITION', scopeId: competitionId }],
      issueKind: 'SCORE_VALUE_PROTEST',
      occurredAt: '2026-09-04T01:00:00.000Z',
      summary: 'Displayed shot value',
      details: 'Lane observation.',
      ruleReferences: 'ISSF 6.10.8',
      openedBy: 'RTS A',
    });
    const repository = new SqliteEstComplaintCaseLinkRepository(database);
    const link = linkValue(examination.id);
    repository.append(link);

    expect(repository.findBySignalId(signalId)).toMatchObject({
      signalId,
      targetExaminationCaseId: examination.id,
      snapshot: { context: { competitionId, recordedShots: 3 } },
      linkedBy: 'RTS A',
    });
    expect(repository.findByCompetitionId(competitionId)).toHaveLength(1);
    expect(() =>
      database
        .prepare('UPDATE est_complaint_target_examination_links SET linked_by = ? WHERE signal_id = ?')
        .run('RTS B', signalId),
    ).toThrow('append-only');
    expect(() =>
      database.prepare('DELETE FROM est_complaint_target_examination_links WHERE signal_id = ?').run(signalId),
    ).toThrow('append-only');
  });

  it('rejects a mismatched snapshot hash before persistence', () => {
    const repository = new SqliteEstComplaintCaseLinkRepository(database);

    expect(() => repository.append({ ...linkValue(crypto.randomUUID()), snapshotSha256: '0'.repeat(64) })).toThrow(
      'snapshot hash does not match',
    );
  });
});

function linkValue(targetExaminationCaseId: string): EstComplaintCaseLink {
  const snapshot: EstComplaintCaseLink['snapshot'] = {
    signalId,
    laneId: '33333333-3333-4333-8333-333333333333',
    firingPointNumber: 7,
    status: 'ACTIVE',
    issue: 'SHOT_VALUE',
    context: {
      competitionId,
      sessionId: '44444444-4444-4444-8444-444444444444',
      participantId: 'athlete-a',
      participantName: 'Athlete A',
      startNumber: '101',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: null,
      exposureIndex: null,
      lastShot: null,
    },
    message: null,
    signalledAt: new Date('2026-09-04T01:00:00.000Z'),
  };
  return {
    signalId,
    targetExaminationCaseId,
    snapshot,
    snapshotSha256: estComplaintSnapshotHash(snapshot),
    linkedBy: 'RTS A',
    linkedAt: new Date('2026-09-04T01:00:01.000Z'),
  };
}
