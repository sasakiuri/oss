// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  AthleteSanctionParticipantEligibilityReader,
  AthleteSanctionResultClassificationSource,
  AthleteSanctionService,
  SqliteAthleteEntryReferenceSource,
  SqliteAthleteSanctionRepository,
} from '@/main/modules/athlete-sanctions';

const championshipId = '11111111-1111-4111-8111-111111111111';
const eventA = '22222222-2222-4222-8222-222222222222';
const eventB = '33333333-3333-4333-8333-333333333333';
const participantA = '44444444-4444-4444-8444-444444444444';
const participantB = '55555555-5555-4555-8555-555555555555';
const fixedNow = new Date('2026-09-04T01:00:00.000Z');

describe('AthleteSanctionService', () => {
  let database: Database.Database;
  let service: AthleteSanctionService;
  let projection: AthleteSanctionResultClassificationSource;
  let eligibility: AthleteSanctionParticipantEligibilityReader;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    seedCompetition(database);
    const repository = new SqliteAthleteSanctionRepository(database);
    const entries = new SqliteAthleteEntryReferenceSource(database);
    service = new AthleteSanctionService(repository, entries, () => fixedNow);
    projection = new AthleteSanctionResultClassificationSource(repository, entries);
    eligibility = new AthleteSanctionParticipantEligibilityReader(repository, entries);
  });

  afterEach(() => database.close());

  it('synchronizes one championship identity from matching ISSF IDs', () => {
    const result = service.synchronizeIssfIdentities({
      championshipId,
      statement: 'Official entries reconciled by ISSF ID',
      officialName: 'RTS A',
    });

    expect(result.identitiesCreated).toBe(1);
    expect(result.participantsLinked).toBe(2);
    expect(result.workspace.identities).toHaveLength(1);
    expect(result.workspace.activeLinks.map((link) => link.participantId).sort()).toEqual(
      [participantA, participantB].sort(),
    );

    const repeated = service.synchronizeIssfIdentities({
      championshipId,
      statement: 'Idempotent follow-up reconciliation',
      officialName: 'RTS A',
    });
    expect(repeated.identitiesCreated).toBe(0);
    expect(repeated.participantsLinked).toBe(0);
  });

  it('projects DSQ to one event and DQB to every linked event until revoked', () => {
    const synchronized = service.synchronizeIssfIdentities({
      championshipId,
      statement: 'ISSF IDs reconciled',
      officialName: 'RTS A',
    });
    const identityId = synchronized.workspace.identities[0]!.id;

    let workspace = service.imposeSanction({
      athleteIdentityId: identityId,
      sourceEventId: eventA,
      classificationCode: 'DSQ',
      scope: 'EVENT',
      authorization: juryAuthorization,
      ruleReference: 'ISSF 6.12.6.1',
      publicRemark: 'DSQ — event rule violation',
    });
    expect(projection.findByEventId(eventA)[0]?.classificationCode).toBe('DSQ');
    expect(projection.findByEventId(eventB)).toEqual([]);

    workspace = service.imposeSanction({
      athleteIdentityId: identityId,
      sourceEventId: eventA,
      classificationCode: 'DQB',
      scope: 'CHAMPIONSHIP',
      authorization: juryAuthorization,
      ruleReference: 'ISSF 6.12.6.2',
      publicRemark: 'DQB — serious rule violation',
    });
    expect(projection.findByEventId(eventA)[0]).toMatchObject({ classificationCode: 'DQB' });
    expect(projection.findByEventId(eventB)[0]).toMatchObject({
      participantId: participantB,
      classificationCode: 'DQB',
    });

    const dqb = workspace.activeSanctions.find((decision) => decision.classificationCode === 'DQB')!;
    service.revokeSanction({
      decisionId: dqb.id,
      authorization: juryAuthorization,
      ruleReference: 'ISSF Jury correction',
      reason: 'DQB decision revoked after review',
    });
    expect(projection.findByEventId(eventA)[0]?.classificationCode).toBe('DSQ');
    expect(projection.findByEventId(eventB)).toEqual([]);
  });

  it('rejects a scope or authority combination that does not match the classification', () => {
    const workspace = service.synchronizeIssfIdentities({
      championshipId,
      statement: 'ISSF IDs reconciled',
      officialName: 'RTS A',
    }).workspace;

    expect(() =>
      service.imposeSanction({
        athleteIdentityId: workspace.identities[0]!.id,
        sourceEventId: eventA,
        classificationCode: 'DQB',
        scope: 'EVENT',
        authorization: juryAuthorization,
        ruleReference: 'ISSF 6.12.6.2',
        publicRemark: 'Invalid scope',
      }),
    ).toThrow('every event in the Championship');
  });

  it('blocks assignment and identity unlinking only while an applicable sanction is active', () => {
    let workspace = service.synchronizeIssfIdentities({
      championshipId,
      statement: 'ISSF IDs reconciled',
      officialName: 'RTS A',
    }).workspace;
    const identityId = workspace.identities[0]!.id;
    workspace = service.imposeSanction({
      athleteIdentityId: identityId,
      sourceEventId: eventA,
      classificationCode: 'DQB',
      scope: 'CHAMPIONSHIP',
      authorization: juryAuthorization,
      ruleReference: 'ISSF 6.12.6.2',
      publicRemark: 'DQB — serious rule violation',
    });

    const assessment = eligibility.assess(participantB);
    expect(assessment).toMatchObject({ participantId: participantB, eligible: false, blockingCode: 'DQB' });
    expect(assessment.decisionIds).toEqual([workspace.activeSanctions[0]!.id]);
    const link = workspace.activeLinks.find((candidate) => candidate.participantId === participantB)!;
    expect(() =>
      service.unlinkParticipant({
        linkId: link.id,
        statement: 'Incorrect event entry link',
        officialName: 'RTS A',
      }),
    ).toThrow('active sanction cannot be unlinked');

    workspace = service.revokeSanction({
      decisionId: workspace.activeSanctions[0]!.id,
      authorization: juryAuthorization,
      ruleReference: 'ISSF Jury correction',
      reason: 'DQB decision revoked after review',
    });
    expect(eligibility.assess(participantB).eligible).toBe(true);
    expect(() =>
      service.unlinkParticipant({
        linkId: link.id,
        statement: 'Incorrect event entry link',
        officialName: 'RTS A',
      }),
    ).not.toThrow();
    expect(workspace.activeSanctions).toEqual([]);
  });
});

const juryAuthorization = {
  basis: 'JURY_MAJORITY' as const,
  authorityReference: 'Jury minutes 17',
  officialName: 'Jury Member A',
  officialRole: 'JURY_MEMBER' as const,
  officialActorId: null,
  mode: 'MANUAL_ATTESTATION' as const,
};

function seedCompetition(database: Database.Database): void {
  database
    .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
    .run(championshipId, 'ISSF Test', '2026-09-04', 'Test Range');
  database
    .prepare('INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(eventA, championshipId, '10m Air Rifle', 'AR60', 'Qualification', 0);
  database
    .prepare('INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(eventB, championshipId, '10m Air Rifle Mixed Team', 'ARMIX', 'Qualification', 1);
  seedParticipant(database, participantA, eventA, 'Athlete A');
  seedParticipant(database, participantB, eventB, 'Athlete A');
}

function seedParticipant(database: Database.Database, id: string, eventId: string, name: string): void {
  database
    .prepare(
      `INSERT INTO participants (
        id, event_id, player_name, affiliation, sort_order, issf_id, gender, entry_status
      ) VALUES (?, ?, ?, 'JPN', 0, 'ISSF-001', 'F', 'COMPETING')`,
    )
    .run(id, eventId, name);
}
