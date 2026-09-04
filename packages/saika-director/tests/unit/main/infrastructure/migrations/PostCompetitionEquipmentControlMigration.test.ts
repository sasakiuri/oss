// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  PostCompetitionEquipmentControlService,
  SqliteEquipmentControlSubjectSource,
  SqlitePostCompetitionEquipmentCheckRepository,
} from '@/main/modules/post-competition-equipment-control';

const championshipId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';

describe('migration063PostCompetitionEquipmentControl', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(championshipId, 'ISSF Test', '2026-09-07', 'Range A');
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(eventId, championshipId, '10m Air Pistol Women', 'AP60W', 'Qualification', 1);
    database
      .prepare(
        `INSERT INTO participants (
          id, event_id, player_name, affiliation, sort_order, start_number, gender, entry_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(participantId, eventId, 'Athlete One', 'Club', 1, '101', 'F', 'COMPETING');
  });

  afterEach(() => database.close());

  it('round-trips trusted snapshots and protects the complete evidence chain', () => {
    const service = new PostCompetitionEquipmentControlService(
      new SqlitePostCompetitionEquipmentCheckRepository(database),
      new SqliteEquipmentControlSubjectSource(database),
      () => new Date('2026-09-07T01:00:30.000Z'),
    );
    const selected = service.select({
      championshipId,
      eventId,
      participantIds: [participantId],
      selectionBasis: 'RANDOM_DRAW',
      selectionStatement: 'Drawn after Qualification.',
      selectedBy: 'EC Jury A',
      selectedAt: '2026-09-07T01:00:00.000Z',
    })[0]!;
    const result = service.recordTest({
      checkId: selected.id,
      outcome: 'PASSED',
      testedItems: ['Shoes', 'Trigger weight'],
      clothingOrTapingCheck: false,
      sameGenderJudgeAvailable: null,
      attempts: 1,
      performedBy: 'Officer A',
      equipmentControlJurySupervisor: 'EC Jury A',
      statement: 'All selected items passed.',
      testedAt: '2026-09-07T01:05:00.000Z',
    });

    expect(service.list(championshipId)[0]).toEqual(result);
    expect(result).toMatchObject({ athleteName: 'Athlete One', startNumber: '101', status: 'PASSED' });
    expect(() =>
      database
        .prepare('UPDATE post_competition_equipment_checks SET athlete_name = ? WHERE id = ?')
        .run('Changed', selected.id),
    ).toThrow('append-only');
    expect(() =>
      database.prepare('DELETE FROM post_competition_equipment_check_entries WHERE check_id = ?').run(selected.id),
    ).toThrow('append-only');
  });
});
