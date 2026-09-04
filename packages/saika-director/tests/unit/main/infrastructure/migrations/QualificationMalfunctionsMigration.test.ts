// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ISSF_2026_RFPM, assessQualificationMalfunctionClaim } from '@sasakiuri/saika-rules';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  SqliteQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';

const championshipId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const competitionId = '44444444-4444-4444-8444-444444444444';
const laneId = '55555555-5555-4555-8555-555555555555';
const caseId = '66666666-6666-4666-8666-666666666666';
const sourceSignalId = '88888888-8888-4888-8888-888888888888';
const now = new Date('2026-09-04T01:00:00.000Z');

describe('migration059QualificationMalfunctions', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(championshipId, 'Championship', '2026-09-04', 'Range');
    database
      .prepare(
        'INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, 0)',
      )
      .run(eventId, championshipId, '25m Rapid Fire Pistol', 'RFPM', 'Qualification');
    database
      .prepare(
        `INSERT INTO participants (
          id, event_id, player_name, affiliation, sort_order, start_number, gender, entry_status
        ) VALUES (?, ?, ?, '', 0, ?, 'M', 'COMPETING')`,
      )
      .run(participantId, eventId, 'Athlete A', '101');
  });

  afterEach(() => database.close());

  it('round-trips policy snapshots and protects the case and entry ledgers', () => {
    const repository = new SqliteQualificationMalfunctionRepository(database);
    const capability = ISSF_2026_RFPM.capabilities.qualificationMalfunction!;
    const value = QualificationMalfunctionCase.create({
      id: caseId,
      competitionId,
      eventId,
      competitionTypeId: 'RFPM',
      policySnapshot: capability,
      participantId,
      participantNameSnapshot: 'Athlete A',
      startNumberSnapshot: '101',
      laneId,
      laneChannelSnapshot: 7,
      relayNumberSnapshot: 1,
      reportSource: 'DIRECTOR_MANUAL',
      claimMode: 'CLAIM',
      phase: 'MATCH',
      stageId: 'STAGE_1',
      stageIndex: 1,
      seriesIndex: 0,
      seriesShotLimit: 5,
      recordedShots: 2,
      timedTargetProgramId: 'RFP_MATCH_8',
      existingClaimsInScope: 0,
      claimAssessment: assessQualificationMalfunctionClaim(capability, {
        phase: 'MATCH',
        existingClaimsInScope: 0,
      }),
      summary: 'Projectile lodged.',
      openedBy: 'RO A',
      occurredAt: now,
      createdAt: now,
    });
    repository.appendCase(value);
    repository.appendEntry(
      QualificationMalfunctionEntry.create({
        caseId,
        type: 'INSPECTION_RECORDED',
        statement: 'Firearm secured and inspected.',
        officialName: 'RO A',
        officialRole: 'RANGE_OFFICER',
        occurredAt: now,
        recordedAt: now,
      }),
    );

    expect(repository.findCaseById(caseId)).toMatchObject({
      participantNameSnapshot: 'Athlete A',
      stageId: 'STAGE_1',
      policySnapshot: { determinationAuthority: 'RANGE_OFFICER' },
    });
    expect(repository.findEntries([caseId]).get(caseId)?.[0]).toMatchObject({
      type: 'INSPECTION_RECORDED',
      officialRole: 'RANGE_OFFICER',
    });
    expect(() =>
      database.prepare('UPDATE qualification_malfunction_cases SET summary = ? WHERE id = ?').run('Changed', caseId),
    ).toThrow('append-only');
    expect(() =>
      database.prepare('DELETE FROM qualification_malfunction_entries WHERE case_id = ?').run(caseId),
    ).toThrow('append-only');
  });

  it('enforces participant/event, live snapshot, and execution artifact boundaries in SQLite', () => {
    const otherEventId = '77777777-7777-4777-8777-777777777777';
    database
      .prepare(
        'INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .run(otherEventId, championshipId, 'Other event', 'RFPM', 'Qualification');
    const policy = JSON.stringify(ISSF_2026_RFPM.capabilities.qualificationMalfunction);
    const assessment = JSON.stringify({
      allowed: true,
      maximumInScope: 1,
      maximumInExceptionalPart: null,
      reason: 'AVAILABLE',
    });

    expect(() => insertRawCase(database, { eventId: otherEventId, policy, assessment })).toThrow(
      'FOREIGN KEY constraint',
    );
    expect(() =>
      insertRawCase(database, {
        eventId,
        policy,
        assessment,
        reportSource: 'LANE_SIGNAL',
        sourceSignalId,
        laneSnapshotCapturedAt: null,
      }),
    ).toThrow('CHECK constraint');

    insertRawCase(database, { eventId, policy, assessment });
    expect(() =>
      database
        .prepare(
          `INSERT INTO qualification_malfunction_entries (
            id, case_id, entry_type, statement, official_name, official_role,
            artifact_id, occurred_at, recorded_at
          ) VALUES (?, ?, 'EXECUTION_RECORDED', 'Executed', 'RO A', 'RANGE_OFFICER', NULL, ?, ?)`,
        )
        .run(crypto.randomUUID(), caseId, now.toISOString(), now.toISOString()),
    ).toThrow('CHECK constraint');
  });

  it('links each Lane declaration to at most one official case at the database boundary', () => {
    const policy = JSON.stringify(ISSF_2026_RFPM.capabilities.qualificationMalfunction);
    const assessment = JSON.stringify({
      allowed: true,
      maximumInScope: 1,
      maximumInExceptionalPart: null,
      reason: 'AVAILABLE',
    });

    insertRawCase(database, {
      eventId,
      policy,
      assessment,
      reportSource: 'LANE_SIGNAL',
      sourceSignalId,
      laneSnapshotCapturedAt: now.toISOString(),
    });

    expect(
      database.prepare('SELECT source_signal_id FROM qualification_malfunction_cases WHERE id = ?').get(caseId),
    ).toEqual({ source_signal_id: sourceSignalId });
    expect(() =>
      insertRawCase(database, {
        caseId: '99999999-9999-4999-8999-999999999999',
        eventId,
        policy,
        assessment,
        reportSource: 'LANE_SIGNAL',
        sourceSignalId,
        laneSnapshotCapturedAt: now.toISOString(),
      }),
    ).toThrow('UNIQUE constraint');
    expect(() =>
      insertRawCase(database, {
        eventId,
        policy,
        assessment,
        reportSource: 'DIRECTOR_MANUAL',
        sourceSignalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).toThrow('manual cases must not have one');
  });
});

function insertRawCase(
  database: Database.Database,
  value: {
    caseId?: string;
    eventId: string;
    policy: string;
    assessment: string;
    reportSource?: 'DIRECTOR_MANUAL' | 'LANE_SIGNAL';
    sourceSignalId?: string | null;
    laneSnapshotCapturedAt?: string | null;
  },
): void {
  database
    .prepare(
      `INSERT INTO qualification_malfunction_cases (
        id, competition_id, event_id, competition_type_id, policy_snapshot_json,
        participant_id, participant_name_snapshot, lane_id, lane_channel_snapshot,
        relay_number_snapshot, report_source, source_signal_id, claim_mode, phase, stage_id, stage_index,
        series_index, series_shot_limit, recorded_shots, timed_target_program_id,
        lane_snapshot_captured_at, existing_claims_in_scope, claim_assessment_json,
        summary, opened_by, occurred_at, created_at
      ) VALUES (
        ?, ?, ?, 'RFPM', ?, ?, 'Athlete A', ?, 7, 1, ?, ?, 'CLAIM', 'MATCH', 'STAGE_1',
        1, 0, 5, 2, 'RFP_MATCH_8', ?, 0, ?, 'Projectile lodged.', 'RO A', ?, ?
      )`,
    )
    .run(
      value.caseId ?? caseId,
      competitionId,
      value.eventId,
      value.policy,
      participantId,
      laneId,
      value.reportSource ?? 'DIRECTOR_MANUAL',
      value.sourceSignalId ?? null,
      value.laneSnapshotCapturedAt ?? null,
      value.assessment,
      now.toISOString(),
      now.toISOString(),
    );
}
