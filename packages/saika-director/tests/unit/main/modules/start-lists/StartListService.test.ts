import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { allMigrations } from '@/main/infrastructure/database/migrations';
import { SqliteStartListRepository, StartListService } from '@/main/modules/start-lists';

const championshipId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const athleteA = '33333333-3333-4333-8333-333333333333';
const athleteB = '44444444-4444-4444-8444-444444444444';

describe('StartListService', () => {
  let database: Database.Database;
  let service: StartListService;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    seedEvent(database);
    service = new StartListService(database, new SqliteStartListRepository(database));
  });

  afterEach(() => database.close());

  it('versions, approves, and distributes an immutable current Start List snapshot', () => {
    let first = service.createVersion({
      eventId,
      listKind: 'QUALIFICATION',
      disciplineGroup: 'RIFLE_PISTOL',
      distributionMode: 'PRINTED',
      scheduledStartAt: '2026-09-05T01:00:00.000Z',
      publicationDueAt: '2026-09-03T07:00:00.000Z',
      createdBy: 'RTS A',
      createdAt: '2026-09-03T06:00:00.000Z',
    });
    expect(first.versionNumber).toBe(1);
    expect(first.rows.map((row) => [row.relayNumber, row.firingPointNumber, row.startNumber])).toEqual([
      [1, 1, '101'],
      [1, 2, '102'],
    ]);
    expect(first.status).toBe('DRAFT');

    first = service.approveContent({
      versionId: first.id,
      officialName: 'TD A',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: 'Names, Bibs, relay, and firing points checked.',
      recordedAt: '2026-09-03T06:15:00.000Z',
    });
    first = service.distribute({
      versionId: first.id,
      officialName: 'RTS A',
      officialRole: 'RTS_OFFICER',
      statement: 'Printed copies distributed to teams and range staff.',
      channels: ['PRINT'],
      recordedAt: '2026-09-03T06:30:00.000Z',
    });
    expect(first.status).toBe('DISTRIBUTED');
    expect(first.deadlineStatus).toBe('ON_TIME');
    expect(first.isCurrent).toBe(true);

    database.prepare('UPDATE participants SET player_name = ? WHERE id = ?').run('Updated Athlete', athleteA);
    expect(service.list(eventId)[0]?.stale).toBe(true);
    expect(() =>
      service.distribute({
        versionId: first.id,
        officialName: 'RTS A',
        officialRole: 'RTS_OFFICER',
        statement: 'Attempt to redistribute stale content.',
        channels: ['PRINT'],
      }),
    ).toThrow('create a new Start List version');

    let second = service.createVersion({
      eventId,
      listKind: 'QUALIFICATION',
      disciplineGroup: 'RIFLE_PISTOL',
      distributionMode: 'PRINTED',
      scheduledStartAt: '2026-09-05T01:00:00.000Z',
      publicationDueAt: '2026-09-03T07:00:00.000Z',
      createdBy: 'RTS A',
    });
    expect(second.versionNumber).toBe(2);
    second = service.approveContent({
      versionId: second.id,
      officialName: 'TD A',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: 'Revised list checked.',
    });
    second = service.distribute({
      versionId: second.id,
      officialName: 'RTS A',
      officialRole: 'RTS_OFFICER',
      statement: 'Revised copies distributed.',
      channels: ['PRINT'],
      recordedAt: '2026-09-03T07:30:00.000Z',
    });
    const versions = service.list(eventId);
    expect(second.deadlineStatus).toBe('LATE');
    expect(versions.find((value) => value.versionNumber === 1)?.isCurrent).toBe(false);
    expect(versions.find((value) => value.versionNumber === 2)?.isCurrent).toBe(true);
  });

  it('requires Technical Delegate approval and ISSF channel coverage for paperless distribution', () => {
    let value = service.createVersion({
      eventId,
      listKind: 'QUALIFICATION',
      disciplineGroup: 'RIFLE_PISTOL',
      distributionMode: 'PAPERLESS',
      scheduledStartAt: '2026-09-05T01:00:00.000Z',
      publicationDueAt: '2026-09-03T07:00:00.000Z',
      createdBy: 'RTS A',
    });
    value = service.approveContent({
      versionId: value.id,
      officialName: 'RTS Jury A',
      officialRole: 'RTS_JURY',
      statement: 'Content checked.',
    });
    expect(() =>
      service.approvePaperless({
        versionId: value.id,
        officialName: 'RTS Jury A',
        officialRole: 'RTS_JURY',
        statement: 'Paperless requested.',
      }),
    ).toThrow('Technical Delegate');
    value = service.approvePaperless({
      versionId: value.id,
      officialName: 'TD A',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: 'Venue paperless system approved.',
    });
    expect(() =>
      service.distribute({
        versionId: value.id,
        officialName: 'RTS A',
        officialRole: 'RTS_OFFICER',
        statement: 'Email only.',
        channels: ['EMAIL'],
      }),
    ).toThrow('public information station');
    value = service.distribute({
      versionId: value.id,
      officialName: 'RTS A',
      officialRole: 'RTS_OFFICER',
      statement: 'Email and public information station available.',
      channels: ['EMAIL', 'PUBLIC_INFORMATION_STATION'],
    });
    expect(value.status).toBe('DISTRIBUTED');
  });

  it('blocks incomplete allocations and requires a protest basis for a Final release', () => {
    database.prepare('DELETE FROM firing_point_assignments WHERE participant_id = ?').run(athleteB);
    let value = service.createVersion({
      eventId,
      listKind: 'FINAL',
      disciplineGroup: 'RIFLE_PISTOL',
      distributionMode: 'PRINTED',
      scheduledStartAt: '2026-09-05T01:00:00.000Z',
      publicationDueAt: '2026-09-05T00:30:00.000Z',
      createdBy: 'RTS A',
    });
    expect(value.findings.some((finding) => finding.code === 'STARTERS_WITHOUT_ALLOCATION')).toBe(true);
    expect(() =>
      service.approveContent({
        versionId: value.id,
        officialName: 'TD A',
        officialRole: 'TECHNICAL_DELEGATE',
        statement: 'Incomplete list.',
      }),
    ).toThrow('blocking');

    seedAssignment(database, crypto.randomUUID(), athleteB, 1, 2);
    value = service.createVersion({
      eventId,
      listKind: 'FINAL',
      disciplineGroup: 'RIFLE_PISTOL',
      distributionMode: 'PRINTED',
      scheduledStartAt: '2026-09-05T01:00:00.000Z',
      publicationDueAt: '2026-09-05T00:30:00.000Z',
      createdBy: 'RTS A',
    });
    value = service.approveContent({
      versionId: value.id,
      officialName: 'TD A',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: 'Finalists and positions checked.',
    });
    expect(() =>
      service.distribute({
        versionId: value.id,
        officialName: 'RTS Jury A',
        officialRole: 'RTS_JURY',
        statement: 'Release Final list.',
        channels: ['PRINT'],
      }),
    ).toThrow('protest release basis');
    value = service.distribute({
      versionId: value.id,
      officialName: 'RTS Jury A',
      officialRole: 'RTS_JURY',
      statement: 'Protests that could affect qualification are cleared.',
      channels: ['PRINT'],
      finalReleaseBasis: 'PROTESTS_CLEARED',
    });
    expect(value.distributions[0]?.finalReleaseBasis).toBe('PROTESTS_CLEARED');
    expect(() => database.prepare('DELETE FROM start_list_versions WHERE id = ?').run(value.id)).toThrow('append-only');
  });
});

function seedEvent(database: Database.Database): void {
  database
    .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
    .run(championshipId, 'ISSF Test', '2026-09-05', 'Test Range');
  database
    .prepare('INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, 0)')
    .run(eventId, championshipId, '10m Air Rifle Women', 'AR60', 'Qualification');
  seedParticipant(database, athleteA, 'Athlete A', '101', 'JPN', 0);
  seedParticipant(database, athleteB, 'Athlete B', '102', 'KOR', 1);
  seedAssignment(database, '55555555-5555-4555-8555-555555555555', athleteA, 1, 1);
  seedAssignment(database, '66666666-6666-4666-8666-666666666666', athleteB, 1, 2);
}

function seedParticipant(
  database: Database.Database,
  id: string,
  name: string,
  startNumber: string,
  nationCode: string,
  sortOrder: number,
): void {
  database
    .prepare(
      `INSERT INTO participants (
        id, event_id, player_name, family_name, affiliation, sort_order,
        start_number, nation_code, gender, entry_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'F', 'COMPETING')`,
    )
    .run(id, eventId, name, name, nationCode, sortOrder, startNumber, nationCode);
}

function seedAssignment(
  database: Database.Database,
  id: string,
  participantId: string,
  relayNumber: number,
  firingPointNumber: number,
): void {
  database
    .prepare(
      `INSERT INTO firing_point_assignments (
        id, event_id, relay_number, firing_point_number, participant_id
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, eventId, relayNumber, firingPointNumber, participantId);
}
