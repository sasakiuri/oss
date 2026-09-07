import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  FinalRecoveryCase,
  FinalRecoveryEntry,
  FinalRecoveryPublicationBlocker,
  SqliteFinalRecoveryRepository,
  SqliteFinalRecoveryEventScope,
} from '@/main/modules/final-recoveries';

const eventId = 'event-a';
describe('Final recovery publication review', () => {
  let db: Database.Database;
  let repository: SqliteFinalRecoveryRepository;
  let blocker: FinalRecoveryPublicationBlocker;
  beforeEach(() => {
    db = new Database(':memory:');
    new MigrationRunner(db).run(allMigrations);
    repository = new SqliteFinalRecoveryRepository(db);
    blocker = new FinalRecoveryPublicationBlocker(repository, (id) =>
      new SqliteFinalRecoveryEventScope(db).competitionIds(id),
    );
  });
  afterEach(() => db.close());
  function open(caseEventId?: string) {
    const value = FinalRecoveryCase.create({
      competitionId: 'competition-a',
      eventId: caseEventId,
      procedureProfile: 'RIFLE_PISTOL_10M_50M',
      incidentType: 'EST_FAILURE',
      phase: 'MATCH_SINGLE',
      affectedLaneIds: ['lane-a'],
      summary: 'Missing indication',
      openedBy: 'RO',
    });
    repository.appendCase(value);
    return value;
  }
  function entry(id: string, type: 'RESUMED' | 'COMPLETED' | 'VOID') {
    repository.appendEntry(
      FinalRecoveryEntry.create({ caseId: id, type, statement: 'Official review', officialName: 'Jury' }),
    );
  }
  it('requires completion or voiding and keeps resumed cases on hold', () => {
    const value = open(eventId);
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([]);
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([expect.stringContaining('OPEN')]);
    entry(value.id, 'RESUMED');
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([expect.stringContaining('RESUMED')]);
    entry(value.id, 'COMPLETED');
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([]);
    const second = open(eventId);
    entry(second.id, 'VOID');
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([]);
  });
  it('includes eventless recovery cases when a Final script associates the competition with the event', () => {
    const value = open();
    db.prepare(
      `INSERT INTO final_operation_runs (id, competition_id, event_id, competition_type_id, rule_pack_id, script_version, script_snapshot_json, scheduled_start_at, created_by, created_at) VALUES ('run-a', 'competition-a', ?, 'AR60_FINAL', 'ISSF', 'v1', '{}', '2026-09-08T00:00:00Z', 'CRO', '2026-09-08T00:00:00Z')`,
    ).run(eventId);
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([expect.stringContaining(value.id)]);
    expect(blocker.getIssues('other-event', 'FINAL')).toEqual([]);
  });
});
