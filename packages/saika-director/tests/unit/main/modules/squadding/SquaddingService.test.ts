import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { SquaddingService } from '@/main/modules/squadding/application/SquaddingService';
import type {
  ISquaddingRepository,
  SquaddingDrawEntryRecord,
} from '@/main/modules/squadding/domain/ISquaddingRepository';
import { SqliteSquaddingRepository } from '@/main/modules/squadding/infra/SqliteSquaddingRepository';
import { CompetitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANTS = [
  ['33333333-3333-4333-8333-333333333333', 'JPN'],
  ['44444444-4444-4444-8444-444444444444', 'USA'],
  ['55555555-5555-4555-8555-555555555555', 'GER'],
  ['66666666-6666-4666-8666-666666666666', 'FRA'],
] as const;

describe('SquaddingService', () => {
  let database: Database.Database;
  let repository: SqliteSquaddingRepository;
  let registry: CompetitionTypeRegistry;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    repository = new SqliteSquaddingRepository(database);
    registry = new CompetitionTypeRegistry();
    registry.register(BR60S);
    seedEvent(database);
  });

  afterEach(() => database.close());

  it('keeps draw, Technical Delegate approval, and explicit assignment application separate', () => {
    const service = new SquaddingService(database, repository, registry);
    const draw = service.createDraw(createInput());

    expect(draw.approval).toBeNull();
    expect(draw.application).toBeNull();
    expect(readAssignments(database)).toEqual([]);

    const approved = service.approve({
      drawId: draw.id,
      officialName: 'Technical Delegate',
      statement: 'Range constraints reviewed',
    });
    expect(approved.approval?.officialName).toBe('Technical Delegate');
    expect(readAssignments(database)).toEqual([]);

    const applied = service.apply({
      drawId: draw.id,
      officialName: 'RTS Operator',
      statement: 'Approved draw applied to the start list',
    });
    expect(applied.application?.officialName).toBe('RTS Operator');
    expect(readAssignments(database).map((row) => row.firing_point_number)).toEqual([5, 6, 7, 8]);
    expect(new Set(readAssignments(database).map((row) => row.participant_id))).toEqual(
      new Set(PARTICIPANTS.map(([id]) => id)),
    );
    expect(() => database.prepare('UPDATE squadding_draws SET seed = ? WHERE id = ?').run('changed', draw.id)).toThrow(
      'append-only',
    );
  });

  it('rejects approval after official entry data changes', () => {
    const service = new SquaddingService(database, repository, registry);
    const draw = service.createDraw(createInput());

    database.prepare('UPDATE participants SET nation_code = ? WHERE id = ?').run('CAN', PARTICIPANTS[0][0]);

    expect(() =>
      service.approve({
        drawId: draw.id,
        officialName: 'Technical Delegate',
        statement: 'Attempted approval after entry update',
      }),
    ).toThrow('participant entry data changed');
    expect(service.list(EVENT_ID)[0]?.stale).toBe(true);
  });

  it('rolls back assignment replacement when the application ledger cannot be appended', () => {
    insertAssignment(database, PARTICIPANTS[0][0], 99);
    const failingRepository: ISquaddingRepository = {
      appendDraw: (draw) => repository.appendDraw(draw),
      appendEntry: (entry: SquaddingDrawEntryRecord) => {
        if (entry.entryType === 'APPLIED') throw new Error('simulated ledger failure');
        repository.appendEntry(entry);
      },
      findByEvent: (eventId) => repository.findByEvent(eventId),
      findById: (id) => repository.findById(id),
    };
    const service = new SquaddingService(database, failingRepository, registry);
    const draw = service.createDraw(createInput());
    service.approve({
      drawId: draw.id,
      officialName: 'Technical Delegate',
      statement: 'Range constraints reviewed',
    });

    expect(() =>
      service.apply({
        drawId: draw.id,
        officialName: 'RTS Operator',
        statement: 'Apply approved draw',
      }),
    ).toThrow('simulated ledger failure');

    expect(readAssignments(database)).toEqual([
      expect.objectContaining({ firing_point_number: 99, participant_id: PARTICIPANTS[0][0] }),
    ]);
    expect(service.list(EVENT_ID)[0]?.application).toBeNull();
  });
});

function createInput() {
  return {
    eventId: EVENT_ID,
    competitionTypeId: BR60S.id,
    seed: 'published-draw-seed',
    relayCount: 1,
    firstFiringPoint: 5,
    firingPointCount: 4,
    statusSectionPolicy: 'OFF' as const,
    createdBy: 'RTS Operator',
  };
}

function seedEvent(database: Database.Database): void {
  database
    .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
    .run(CHAMPIONSHIP_ID, 'Test Championship', '2026-09-01', 'Test Range');
  database
    .prepare('INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(EVENT_ID, CHAMPIONSHIP_ID, 'Qualification', BR60S.id, 'Qualification', 0);
  const insert = database.prepare(`INSERT INTO participants (
    id, event_id, player_name, family_name, affiliation, sort_order,
    nation_code, gender, entry_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  PARTICIPANTS.forEach(([id, nationCode], index) => {
    insert.run(
      id,
      EVENT_ID,
      `Athlete ${index + 1}`,
      `Athlete ${index + 1}`,
      nationCode,
      index,
      nationCode,
      'M',
      'COMPETING',
    );
  });
}

function insertAssignment(database: Database.Database, participantId: string, firingPointNumber: number): void {
  database
    .prepare(
      `INSERT INTO firing_point_assignments
       (id, event_id, relay_number, firing_point_number, participant_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run('77777777-7777-4777-8777-777777777777', EVENT_ID, 1, firingPointNumber, participantId);
}

function readAssignments(database: Database.Database): Array<{
  firing_point_number: number;
  participant_id: string;
}> {
  return database
    .prepare(
      'SELECT firing_point_number, participant_id FROM firing_point_assignments WHERE event_id = ? ORDER BY firing_point_number',
    )
    .all(EVENT_ID) as Array<{ firing_point_number: number; participant_id: string }>;
}
