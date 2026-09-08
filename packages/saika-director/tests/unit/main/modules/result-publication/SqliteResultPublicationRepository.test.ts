import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration017ResultPublication } from '@/main/infrastructure/database/migrations/017_result_publication';
import { ResultPublication } from '@/main/modules/result-publication/domain/ResultPublication';
import { createProtestRegisteredEntry } from '@/main/modules/result-publication/domain/ResultPublicationEntry';
import { SqliteResultPublicationRepository } from '@/main/modules/result-publication/infra/SqliteResultPublicationRepository';

const REVISION = 'a'.repeat(64);

describe('SqliteResultPublicationRepository', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  function setup() {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration003CreateSchema.up(database);
    migration017ResultPublication.up(database);
    database
      .prepare(
        `INSERT INTO championships (id, name, date, venue) VALUES ('championship-1', 'Meet', '2026-08-29', 'Range')`,
      )
      .run();
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES ('event-1', 'championship-1', 'Qualification', 'BR60S', 'Qualification', 0)`,
      )
      .run();
    return new SqliteResultPublicationRepository(database);
  }

  it('round-trips an append-only publication journal', () => {
    const repository = setup();
    let publication = ResultPublication.empty('event-1', 'QUALIFICATION');
    const preliminary = publication.publishPreliminary({
      snapshotRevision: REVISION,
      postedAt: new Date('2026-08-29T01:00:00.000Z'),
      protestWindowMs: 600_000,
      officialName: 'RTS Officer',
    });
    repository.append(preliminary);
    publication = ResultPublication.reconstruct(
      'event-1',
      'QUALIFICATION',
      repository.findByEvent('event-1', 'QUALIFICATION'),
    );
    const protest = publication.registerProtest({
      protestReference: 'P-001',
      registeredAt: new Date('2026-08-29T01:05:00.000Z'),
    });
    repository.append(protest);

    const restored = ResultPublication.reconstruct(
      'event-1',
      'QUALIFICATION',
      repository.findByEvent('event-1', 'QUALIFICATION'),
    );

    expect(restored.stateAt(new Date('2026-08-29T01:10:00.000Z'))).toEqual(
      expect.objectContaining({ status: 'PROTEST_PENDING', openProtestReferences: ['P-001'] }),
    );
  });

  it('preserves actual posting facts separately from the entry timestamp', () => {
    const repository = setup();
    const entry = ResultPublication.empty('event-1', 'QUALIFICATION').publishPreliminary({
      snapshotRevision: REVISION,
      postedAt: new Date('2026-08-29T01:00:00Z'),
      recordedAt: new Date('2026-08-29T01:04:00Z'),
      protestWindowMs: 600_000,
      officialName: 'RTS Officer',
      postingLocation: 'Main scoreboard',
      postingReference: 'List 17',
    });
    repository.append(entry);
    expect(repository.findByEvent('event-1', 'QUALIFICATION')).toEqual([entry]);
  });

  it('prevents update and delete of journal entries', () => {
    const repository = setup();
    const preliminary = ResultPublication.empty('event-1', 'QUALIFICATION').publishPreliminary({
      snapshotRevision: REVISION,
      postedAt: new Date('2026-08-29T01:00:00.000Z'),
      protestWindowMs: 600_000,
      officialName: 'RTS Officer',
    });
    repository.append(preliminary);

    expect(() => database?.prepare('UPDATE result_publication_entries SET recorded_at = recorded_at').run()).toThrow(
      'append-only',
    );
    expect(() => database?.prepare('DELETE FROM result_publication_entries').run()).toThrow('append-only');
  });

  it('uses append order even if the system clock moves backwards', () => {
    const repository = setup();
    let publication = ResultPublication.empty('event-1', 'QUALIFICATION');
    const preliminary = publication.publishPreliminary({
      snapshotRevision: REVISION,
      postedAt: new Date('2026-08-29T01:00:00.000Z'),
      protestWindowMs: 600_000,
      officialName: 'RTS Officer',
    });
    repository.append(preliminary);
    publication = ResultPublication.reconstruct('event-1', 'QUALIFICATION', [preliminary]);
    const protest = publication.registerProtest({
      protestReference: 'P-001',
      registeredAt: new Date('2026-08-29T01:05:00.000Z'),
    });
    repository.append(protest);
    publication = ResultPublication.reconstruct('event-1', 'QUALIFICATION', [preliminary, protest]);
    repository.append(
      publication.resolveProtest({
        protestReference: 'P-001',
        resolution: 'Score confirmed',
        officialName: 'Jury Member',
        resolvedAt: new Date('2026-08-29T00:59:00.000Z'),
      }),
    );

    const restored = ResultPublication.reconstruct(
      'event-1',
      'QUALIFICATION',
      repository.findByEvent('event-1', 'QUALIFICATION'),
    );

    expect(restored.stateAt(new Date('2026-08-29T01:10:00.000Z')).status).toBe('PROTEST_CLOSED');
  });

  it('rejects duplicate protest records at the database boundary', () => {
    const repository = setup();
    const preliminary = ResultPublication.empty('event-1', 'QUALIFICATION').publishPreliminary({
      snapshotRevision: REVISION,
      postedAt: new Date('2026-08-29T01:00:00.000Z'),
      protestWindowMs: 600_000,
      officialName: 'RTS Officer',
    });
    repository.append(preliminary);
    const first = createProtestRegisteredEntry({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      preliminaryId: preliminary.id,
      protestReference: 'P-001',
      registeredAt: new Date('2026-08-29T01:04:00.000Z'),
    });
    const duplicate = createProtestRegisteredEntry({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      preliminaryId: preliminary.id,
      protestReference: 'P-001',
      registeredAt: new Date('2026-08-29T01:05:00.000Z'),
    });
    repository.append(first);

    expect(() => repository.append(duplicate)).toThrow('UNIQUE constraint failed');
  });
});
