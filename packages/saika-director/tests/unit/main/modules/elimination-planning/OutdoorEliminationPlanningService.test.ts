// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration025OfficialEntries } from '@/main/infrastructure/database/migrations/025_official_entries';
import { migration046OutdoorEliminationPlans } from '@/main/infrastructure/database/migrations/046_outdoor_elimination_plans';
import {
  OutdoorEliminationPlanningService,
  SqliteEliminationPlanningSource,
  SqliteOutdoorEliminationPlanRepository,
} from '@/main/modules/elimination-planning';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import { ISSF_2026_R3P60_ELIMINATION } from '@sasakiuri/saika-rules';

describe('OutdoorEliminationPlanningService', () => {
  let database: Database.Database;
  let service: OutdoorEliminationPlanningService;
  const championshipId = '11111111-1111-4111-8111-111111111111';
  const eventId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration003CreateSchema.up(database);
    migration025OfficialEntries.up(database);
    migration046OutdoorEliminationPlans.up(database);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(championshipId, 'Championship', '2026-09-01', 'Outdoor range');
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES (?, ?, 'Elimination', 'R3P60_ELIMINATION', 'Elimination', 0)`,
      )
      .run(eventId, championshipId);
    const insertParticipant = database.prepare(
      `INSERT INTO participants (id, event_id, player_name, affiliation, sort_order, nation_code, entry_status)
       VALUES (?, ?, ?, 'Club', ?, ?, 'COMPETING')`,
    );
    for (let index = 0; index < 13; index += 1) {
      insertParticipant.run(
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        eventId,
        `Athlete ${index + 1}`,
        index,
        `N${index + 1}`,
      );
    }
    const registry = new CompetitionTypeRegistry();
    registry.register(competitionTypeFromRulePack(ISSF_2026_R3P60_ELIMINATION));
    service = new OutdoorEliminationPlanningService(
      new SqliteOutdoorEliminationPlanRepository(database),
      new SqliteEliminationPlanningSource(database),
      registry,
      { now: () => new Date('2026-09-01T00:00:00.000Z') },
    );
  });

  afterEach(() => database.close());

  it('keeps the plan blocked until a complete relay assignment exists', () => {
    const plan = service.create({ eventId, usableFiringPoints: 12, createdBy: 'RTS A' });

    expect(plan).toMatchObject({ status: 'REQUIRED', entryCount: 13, minimumRelayCount: 2, stale: false });
    expect(() => service.approve({ planId: plan.id, officialName: 'TD A', statement: 'Approved' })).toThrow(
      'Complete and apply',
    );
  });

  it('persists, approves and announces proportional quotas without applying athlete advancement', () => {
    assignAll(database, eventId, 7);
    let plan = service.create({ eventId, usableFiringPoints: 12, createdBy: 'RTS A' });

    expect(plan.status).toBe('PLANNED');
    expect(plan.relayStartCounts).toEqual([7, 6]);
    expect(plan.relayQuotas.map((quota) => quota.qualifyCount)).toEqual([6, 6]);
    plan = service.approve({ planId: plan.id, officialName: 'TD A', statement: 'Quota calculation approved' });
    plan = service.announceQuotas({
      planId: plan.id,
      officialName: 'RTS A',
      statement: 'Announced at the Technical Meeting',
    });

    expect(plan.approval?.officialName).toBe('TD A');
    expect(plan.quotaAnnouncement?.statement).toContain('Technical Meeting');
    expect(service.list(eventId)).toHaveLength(1);
    expect(() => database.prepare('UPDATE outdoor_elimination_plans SET created_by = ?').run('Changed')).toThrow(
      'append-only',
    );
  });

  it('marks an immutable plan stale when the start-list source changes', () => {
    assignAll(database, eventId, 7);
    const plan = service.create({ eventId, usableFiringPoints: 12, createdBy: 'RTS A' });
    database
      .prepare("UPDATE participants SET entry_status = 'DNS' WHERE id = ?")
      .run('00000000-0000-4000-8000-000000000013');

    expect(service.list(eventId)[0]?.stale).toBe(true);
    expect(() => service.approve({ planId: plan.id, officialName: 'TD A', statement: 'Approved' })).toThrow('changed');
  });
});

function assignAll(database: Database.Database, eventId: string, firstRelayCount: number): void {
  const participants = database
    .prepare('SELECT id FROM participants WHERE event_id = ? ORDER BY sort_order')
    .all(eventId) as {
    id: string;
  }[];
  const insert = database.prepare(
    `INSERT INTO firing_point_assignments
      (id, event_id, relay_number, firing_point_number, participant_id)
     VALUES (?, ?, ?, ?, ?)`,
  );
  participants.forEach((participant, index) => {
    const relayNumber = index < firstRelayCount ? 1 : 2;
    const firingPointNumber = index < firstRelayCount ? index + 1 : index - firstRelayCount + 1;
    insert.run(crypto.randomUUID(), eventId, relayNumber, firingPointNumber, participant.id);
  });
}
