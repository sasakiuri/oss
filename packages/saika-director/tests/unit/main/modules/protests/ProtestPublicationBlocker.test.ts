import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  ProtestCase,
  ProtestEntry,
  ProtestPublicationBlocker,
  SqliteProtestEventScope,
  SqliteProtestRepository,
} from '@/main/modules/protests';
import { GuardedResultPublicationReadiness } from '@/main/modules/result-publication/application/GuardedResultPublicationReadiness';
import { OptionalResultPublicationBlocker } from '@/main/modules/result-publication/application/OptionalResultPublicationBlocker';
import { ResultPublicationService } from '@/main/modules/result-publication/application/ResultPublicationService';
import { SqliteResultPublicationRepository } from '@/main/modules/result-publication/infra/SqliteResultPublicationRepository';

const eventId = 'event-a';
describe('Protest publication review', () => {
  let db: Database.Database;
  let repository: SqliteProtestRepository;
  let blocker: ProtestPublicationBlocker;
  beforeEach(() => {
    db = new Database(':memory:');
    new MigrationRunner(db).run(allMigrations);
    db.exec(`
      INSERT INTO championships (id, name, date, venue) VALUES ('champ-a', 'Meet', '2026-09-08', 'Range');
      INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
        VALUES ('event-a', 'champ-a', 'Qualification', 'AR60', 'Qualification', 0);
    `);
    repository = new SqliteProtestRepository(db);
    blocker = new ProtestPublicationBlocker(repository, (id, scope) =>
      new SqliteProtestEventScope(db).competitionIds(id, scope),
    );
  });
  afterEach(() => db.close());

  function open(overrides: Partial<Parameters<typeof ProtestCase.create>[0]> = {}) {
    const value = ProtestCase.create({
      scopeType: 'EVENT',
      scopeId: eventId,
      kind: 'VERBAL',
      subject: 'Result affected by interruption',
      statement: 'Jury review requested',
      lodgedBy: 'Team official',
      lodgedAt: new Date('2026-09-08T00:00:00Z'),
      openedBy: 'RO',
      ...overrides,
    });
    repository.appendCase(value);
    return value;
  }
  function append(caseId: string, type: Parameters<typeof ProtestEntry.create>[0]['type']) {
    repository.appendEntry(
      ProtestEntry.create({ caseId, type, statement: 'Reviewed', officialName: 'Jury', occurredAt: new Date() }),
    );
  }

  it('reads current history and keeps decided cases on hold until review is closed', () => {
    const value = open();
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([expect.stringContaining('(OPEN)')]);
    append(value.id, 'DECIDED_UPHELD');
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([expect.stringContaining('(DECIDED)')]);
    append(value.id, 'CLOSED');
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([]);
    const appeal = open({ kind: 'APPEAL', parentProtestId: value.id });
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([expect.stringContaining(appeal.id)]);
    append(appeal.id, 'VOID');
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([]);
  });

  it('isolates other events and Final-only protests', () => {
    open({ scopeId: 'other-event' });
    const value = open({ kind: 'FINAL_VERBAL' });
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([]);
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([expect.stringContaining(value.id)]);
  });

  it('includes competition cases associated by Final scripts without holding Qualification results', () => {
    const value = open({ scopeType: 'COMPETITION', scopeId: 'competition-a' });
    db.prepare(
      `INSERT INTO final_operation_runs (id, competition_id, event_id, competition_type_id, rule_pack_id, script_version, script_snapshot_json, scheduled_start_at, created_by, created_at)
       VALUES ('run-a', 'competition-a', ?, 'AR60_FINAL', 'ISSF', 'v1', '{}', '2026-09-08T00:00:00Z', 'CRO', '2026-09-08T00:00:00Z')`,
    ).run(eventId);
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([]);
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([expect.stringContaining(value.id)]);
    expect(blocker.getIssues('other-event', 'FINAL')).toEqual([]);
  });

  it('holds official publication without duplicating the protest and supports independent manual operation', async () => {
    let required = true;
    let now = new Date('2026-09-08T00:00:00Z');
    const revision = 'a'.repeat(64);
    const readiness = new GuardedResultPublicationReadiness(
      {
        getCurrent: async () => ({
          supported: true,
          resultCount: 1,
          snapshotRevision: revision,
          approvalId: 'approval-a',
          approvalSnapshotRevision: revision,
          verificationIssues: [],
        }),
      },
      [new OptionalResultPublicationBlocker(blocker, () => required)],
    );
    const service = new ResultPublicationService(
      new SqliteResultPublicationRepository(db),
      readiness,
      { resolve: async () => ({ scoreProtestWindowMs: 600_000 }) },
      { now: () => now },
    );
    const input = { eventId, resultScope: 'QUALIFICATION' as const, officialName: 'RTS Jury' };
    await service.publishPreliminary(input);
    now = new Date('2026-09-08T00:10:00Z');
    const value = open();
    await expect(service.publishOfficial(input)).rejects.toThrow(value.id);
    expect((await service.getStatus(eventId, 'QUALIFICATION')).openProtestReferences).toEqual([]);
    expect((await readiness.getCurrent(eventId, 'FINAL')).verificationIssues).toHaveLength(1);
    required = false;
    expect((await service.getStatus(eventId, 'QUALIFICATION')).canPublishOfficial).toBe(true);
    required = true;
    append(value.id, 'CLOSED');
    expect((await service.publishOfficial(input)).status).toBe('OFFICIAL');
    open({ kind: 'APPEAL', parentProtestId: value.id });
    expect((await service.getStatus(eventId, 'QUALIFICATION')).publicationCurrent).toBe(false);
  });
});
