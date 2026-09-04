// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';

const championshipA = '11111111-1111-4111-8111-111111111111';
const championshipB = '22222222-2222-4222-8222-222222222222';
const eventA = '33333333-3333-4333-8333-333333333333';
const eventB = '44444444-4444-4444-8444-444444444444';
const participantA = '55555555-5555-4555-8555-555555555555';
const participantB = '66666666-6666-4666-8666-666666666666';
const identityA = '77777777-7777-4777-8777-777777777777';

describe('migration058AthleteIdentitiesAndSanctions', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    seedChampionship(database, championshipA, eventA, participantA, 'ISSF-001');
    seedChampionship(database, championshipB, eventB, participantB, 'ISSF-001');
    database
      .prepare(
        `INSERT INTO athlete_identities (
          id, championship_id, display_name, issf_id, created_by, creation_statement, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(identityA, championshipA, 'Athlete A', 'ISSF-001', 'RTS A', 'Official entry matched', now);
  });

  afterEach(() => database.close());

  it('enforces championship and ISSF-ID boundaries on participant links', () => {
    expect(() => insertLink(database, participantB, 'ISSF_ID')).toThrow('same Championship');

    database.prepare('UPDATE participants SET issf_id = ? WHERE id = ?').run('ISSF-999', participantA);
    expect(() => insertLink(database, participantA, 'ISSF_ID')).toThrow('matching ISSF IDs');

    expect(() => insertLink(database, participantA, 'MANUAL')).not.toThrow();
    expect(() => insertLink(database, participantA, 'MANUAL', crypto.randomUUID())).toThrow('active athlete identity');
    expect(() => database.prepare('DELETE FROM participants WHERE id = ?').run(participantA)).not.toThrow();
    expect(database.prepare('SELECT player_name_snapshot FROM athlete_identity_link_entries').get()).toMatchObject({
      player_name_snapshot: 'Athlete',
    });
  });

  it('stores append-only sanction and revocation decisions with ISSF scope constraints', () => {
    insertLink(database, participantA, 'ISSF_ID');
    const imposedId = '88888888-8888-4888-8888-888888888888';
    insertDecision(database, {
      id: imposedId,
      type: 'IMPOSED',
      code: 'DQB',
      scope: 'CHAMPIONSHIP',
      basis: 'JURY_MAJORITY',
      role: 'JURY_MEMBER',
      reversesId: null,
    });

    expect(() => database.prepare('UPDATE athlete_sanction_decisions SET public_remark = ?').run('changed')).toThrow(
      'append-only',
    );
    expect(() => database.prepare('DELETE FROM events WHERE id = ?').run(eventA)).toThrow('sanction history');
    expect(() =>
      insertDecision(database, {
        id: crypto.randomUUID(),
        type: 'REVOKED',
        code: 'DQB',
        scope: 'CHAMPIONSHIP',
        basis: 'JURY_MAJORITY',
        role: 'JURY_MEMBER',
        reversesId: crypto.randomUUID(),
      }),
    ).toThrow('match the imposed decision');
    expect(() =>
      insertDecision(database, {
        id: crypto.randomUUID(),
        type: 'IMPOSED',
        code: 'DQB',
        scope: 'EVENT',
        basis: 'JURY_MAJORITY',
        role: 'JURY_MEMBER',
        reversesId: null,
      }),
    ).toThrow('CHECK constraint');
    expect(() =>
      insertDecision(database, {
        id: crypto.randomUUID(),
        type: 'IMPOSED',
        code: 'DQB',
        scope: 'CHAMPIONSHIP',
        basis: 'JURY_MAJORITY',
        role: 'EQUIPMENT_CONTROL_JURY',
        reversesId: null,
      }),
    ).toThrow('CHECK constraint');
  });
});

const now = '2026-09-04T01:00:00.000Z';

function seedChampionship(
  database: Database.Database,
  championshipId: string,
  eventId: string,
  participantId: string,
  issfId: string,
): void {
  database
    .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
    .run(championshipId, `Championship ${championshipId}`, '2026-09-04', 'Range');
  database
    .prepare('INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, 0)')
    .run(eventId, championshipId, '10m Air Rifle', 'AR60', 'Qualification');
  database
    .prepare(
      `INSERT INTO participants (
        id, event_id, player_name, affiliation, sort_order, issf_id, gender, entry_status
      ) VALUES (?, ?, ?, '', 0, ?, 'F', 'COMPETING')`,
    )
    .run(participantId, eventId, 'Athlete', issfId);
}

function insertLink(
  database: Database.Database,
  participantId: string,
  basis: 'ISSF_ID' | 'MANUAL',
  id = '99999999-9999-4999-8999-999999999999',
): void {
  database
    .prepare(
      `INSERT INTO athlete_identity_link_entries (
        id, athlete_identity_id, participant_id, entry_type, link_basis,
        event_id_snapshot, event_name_snapshot, player_name_snapshot, issf_id_snapshot,
        statement, official_name, recorded_at, reverses_link_id
      )
      SELECT ?, ?, participant.id, 'LINKED', ?, event.id, event.name, participant.player_name,
             participant.issf_id, ?, ?, ?, NULL
      FROM participants participant
      JOIN events event ON event.id = participant.event_id
      WHERE participant.id = ?`,
    )
    .run(id, identityA, basis, 'Identity linked', 'RTS A', now, participantId);
}

function insertDecision(
  database: Database.Database,
  value: {
    id: string;
    type: 'IMPOSED' | 'REVOKED';
    code: 'DSQ' | 'DQB' | 'AD_DSQ';
    scope: 'EVENT' | 'CHAMPIONSHIP';
    basis: 'JURY_MAJORITY' | 'POST_COMPETITION_CHECK' | 'ANTI_DOPING_DECISION';
    role: 'JURY_MEMBER' | 'EQUIPMENT_CONTROL_JURY' | 'ANTI_DOPING_AUTHORITY';
    reversesId: string | null;
  },
): void {
  database
    .prepare(
      `INSERT INTO athlete_sanction_decisions (
        id, athlete_identity_id, source_event_id, decision_type, classification_code,
        sanction_scope, authority_basis, authority_reference, rule_reference,
        incident_report_number, public_remark, internal_note, official_name,
        official_role, official_actor_id, authorization_mode, decided_at,
        recorded_at, reverses_decision_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL, 'MANUAL_ATTESTATION', ?, ?, ?)`,
    )
    .run(
      value.id,
      identityA,
      eventA,
      value.type,
      value.code,
      value.scope,
      value.basis,
      'Authority record',
      'ISSF 6.12.6',
      'Public sanction remark',
      'Jury A',
      value.role,
      now,
      now,
      value.reversesId,
    );
}
